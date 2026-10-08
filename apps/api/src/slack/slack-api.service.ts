import { Injectable, Logger } from '@nestjs/common';
import { SlackConfig } from './slack.config';

export interface SlackApiResponse {
  ok: boolean;
  error?: string;
}

export interface SlackPostMessageResult extends SlackApiResponse {
  channel?: string;
  ts?: string;
  message?: Record<string, unknown>;
}

export interface SlackOpenConnectionResult extends SlackApiResponse {
  url?: string;
}

/**
 * Low-level REST API client for Slack Web API and Socket Mode connection setup.
 * Interacts directly with Slack endpoints using native fetch.
 */
@Injectable()
export class SlackApiService {
  private readonly logger = new Logger(SlackApiService.name);
  private readonly baseUrl = 'https://slack.com/api';

  constructor(private readonly slackConfig: SlackConfig) {}

  /**
   * Post a message to a channel or user DM via chat.postMessage.
   * Requires Bot User OAuth Token (xoxb-...).
   */
  async postMessage(channel: string, text: string): Promise<SlackPostMessageResult | null> {
    if (!this.slackConfig.isConfigured() || !this.slackConfig.botToken) {
      this.logger.warn('Cannot send Slack message: bot token is not configured');
      return null;
    }

    const url = `${this.baseUrl}/chat.postMessage`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.slackConfig.botToken}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          channel,
          text,
        }),
      });

      const data = (await response.json()) as SlackPostMessageResult;

      if (!data.ok) {
        this.logger.error(`Slack postMessage failed: ${data.error || 'Unknown error'}`);
        return null;
      }

      return data;
    } catch (err) {
      this.logger.error(`Failed to call Slack chat.postMessage API: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Request a WebSocket endpoint for Socket Mode via apps.connections.open.
   * Requires App-Level Token (xapp-...).
   * Returns the wss:// URL on success, or null on failure.
   */
  async openSocketConnection(): Promise<string | null> {
    if (!this.slackConfig.isConfigured() || !this.slackConfig.appToken) {
      this.logger.warn('Cannot open Slack socket connection: app token is not configured');
      return null;
    }

    const url = `${this.baseUrl}/apps.connections.open`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.slackConfig.appToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const data = (await response.json()) as SlackOpenConnectionResult;

      if (!data.ok || !data.url) {
        this.logger.error(`Slack apps.connections.open failed: ${data.error || 'Unknown error'}`);
        return null;
      }

      // Do NOT log data.url as it contains a sensitive credential ticket
      return data.url;
    } catch (err) {
      this.logger.error(
        `Failed to call Slack apps.connections.open API: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
