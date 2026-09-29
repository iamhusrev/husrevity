import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  Optional,
} from '@nestjs/common';
import { SlackConfig } from './slack.config';
import { SlackApiService } from './slack-api.service';
import { SlackMessageHandlerService } from './slack-message-handler.service';

export const SLACK_WEBSOCKET_FACTORY = Symbol('SLACK_WEBSOCKET_FACTORY');
export type WebSocketFactory = (url: string) => WebSocket;

export interface SlackSocketEnvelope {
  envelope_id?: string;
  type?: string;
  payload?: Record<string, any>;
  accepts_response_payload?: boolean;
  retry_attempt?: number;
  retry_reason?: string;
}

/**
 * Socket Mode client service for Slack WebSocket connection.
 * Manages WebSocket connection, message envelope acking, event deduplication,
 * exponential backoff reconnects, and lifecycle management.
 */
@Injectable()
export class SlackSocketModeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlackSocketModeService.name);
  private ws: WebSocket | null = null;
  private isDestroyed = false;
  private isConnecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 1000;
  private readonly maxBackoffMs = 30000;

  // Bounded set for de-duplicating events_api payloads (cap 500, evict oldest)
  private readonly dedupeSet = new Set<string>();
  private static readonly MAX_DEDUPE_SIZE = 500;

  private wsFactory: WebSocketFactory;

  constructor(
    private readonly slackConfig: SlackConfig,
    private readonly slackApiService: SlackApiService,
    private readonly slackMessageHandlerService: SlackMessageHandlerService,
    @Optional()
    @Inject(SLACK_WEBSOCKET_FACTORY)
    customWsFactory?: WebSocketFactory,
  ) {
    this.wsFactory =
      customWsFactory ||
      ((url: string) => new (globalThis.WebSocket as any)(url));
  }

  setWebSocketFactory(factory: WebSocketFactory): void {
    this.wsFactory = factory;
  }

  onModuleInit(): void {
    if (!this.slackConfig.isConfigured()) {
      this.logger.warn(
        'Slack socket mode skipped: SLACK_BOT_TOKEN and/or SLACK_APP_TOKEN is not configured',
      );
      return;
    }

    this.connect();
  }

  onModuleDestroy(): void {
    this.isDestroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.closeExistingSocket();
  }

  getBackoffMs(): number {
    return this.backoffMs;
  }

  getDedupeSetSize(): number {
    return this.dedupeSet.size;
  }

  isSocketActive(): boolean {
    return this.ws !== null;
  }

  /**
   * Establishes Socket Mode connection using SlackApiService openSocketConnection.
   */
  async connect(): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

    // Never stack live sockets or concurrent connection attempts
    if (this.isConnecting || this.ws !== null) {
      return;
    }

    this.isConnecting = true;

    try {
      const url = await this.slackApiService.openSocketConnection();
      if (!url) {
        this.logger.error('Failed to obtain Slack WebSocket URL');
        this.isConnecting = false;
        this.scheduleReconnect();
        return;
      }

      if (this.isDestroyed) {
        this.isConnecting = false;
        return;
      }

      this.closeExistingSocket();

      const ws = this.wsFactory(url);
      this.ws = ws;
      this.isConnecting = false;

      ws.onopen = () => {
        this.logger.log('Slack Socket Mode WebSocket connected');
      };

      ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(ws, event.data);
      };

      ws.onerror = (_err: Event) => {
        this.logger.error('Slack Socket Mode WebSocket error');
      };

      ws.onclose = () => {
        this.logger.log('Slack Socket Mode WebSocket closed');
        if (this.ws === ws) {
          this.ws = null;
        }
        this.scheduleReconnect();
      };
    } catch (err) {
      this.logger.error(
        `Error connecting Slack Socket Mode: ${(err as Error).message}`,
      );
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Processes raw message received over WebSocket.
   */
  handleMessage(ws: WebSocket, rawData: any): void {
    try {
      const text = typeof rawData === 'string' ? rawData : rawData.toString();
      const envelope: SlackSocketEnvelope = JSON.parse(text);

      // Ack envelope FIRST before any handler processing
      if (envelope.envelope_id) {
        this.sendAck(ws, envelope.envelope_id);
      }

      // Reset exponential backoff on successful hello
      if (envelope.type === 'hello') {
        this.logger.log('Slack Socket Mode hello received, resetting backoff');
        this.backoffMs = 1000;
        return;
      }

      // Disconnect envelope requested by Slack
      if (envelope.type === 'disconnect') {
        this.logger.log('Slack requested disconnect, closing socket to reconnect');
        this.closeExistingSocket();
        this.scheduleReconnect(true);
        return;
      }

      // Process events_api with deduplication by event_id
      if (envelope.type === 'events_api' && envelope.payload) {
        const eventId =
          envelope.payload.event_id || envelope.payload.event?.event_id;
        if (eventId) {
          if (this.isDuplicateEvent(eventId)) {
            this.logger.debug(`Duplicate event_id ${eventId} ignored`);
            return;
          }
        }

        // Dispatch must not block ack or socket processing
        this.slackMessageHandlerService
          .handleEvent(envelope.payload)
          .catch((err) => {
            this.logger.error(
              `Error processing Slack event payload: ${(err as Error).message}`,
            );
          });
      }
    } catch (err) {
      this.logger.error(
        `Failed to parse Slack Socket message: ${(err as Error).message}`,
      );
    }
  }

  private sendAck(ws: WebSocket, envelopeId: string): void {
    try {
      if (ws.readyState === 1 /* OPEN */) {
        ws.send(JSON.stringify({ envelope_id: envelopeId }));
      }
    } catch (err) {
      this.logger.error(
        `Failed to send ack for envelope ${envelopeId}: ${(err as Error).message}`,
      );
    }
  }

  private isDuplicateEvent(eventId: string): boolean {
    if (this.dedupeSet.has(eventId)) {
      return true;
    }
    this.dedupeSet.add(eventId);
    if (this.dedupeSet.size > SlackSocketModeService.MAX_DEDUPE_SIZE) {
      const firstKey = this.dedupeSet.keys().next().value;
      if (firstKey !== undefined) {
        this.dedupeSet.delete(firstKey);
      }
    }
    return false;
  }

  private scheduleReconnect(immediate = false): void {
    if (this.isDestroyed) {
      return;
    }

    if (this.reconnectTimer) {
      return;
    }

    const delay = immediate ? 0 : this.backoffMs;
    if (!immediate) {
      this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private closeExistingSocket(): void {
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        // ignore close errors
      }
    }
  }
}
