import { Test, TestingModule } from '@nestjs/testing';
import { SlackSocketModeService } from './slack-socket-mode.service';
import { SlackConfig } from './slack.config';
import { SlackApiService } from './slack-api.service';
import { SlackMessageHandlerService } from './slack-message-handler.service';

class FakeWebSocket {
  url: string;
  readyState = 1; // 1 = OPEN, 3 = CLOSED
  sentMessages: string[] = [];

  onopen: ((event: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.readyState = 3;
    if (this.onclose) {
      this.onclose({} as any);
    }
  }

  emitMessage(data: Record<string, any>): void {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) } as any);
    }
  }
}

describe('SlackSocketModeService', () => {
  let service: SlackSocketModeService;
  let slackConfig: jest.Mocked<SlackConfig>;
  let slackApiService: jest.Mocked<SlackApiService>;
  let slackMessageHandlerService: jest.Mocked<SlackMessageHandlerService>;
  let currentFakeWs: FakeWebSocket | null = null;

  const mockWsFactory = (url: string): any => {
    currentFakeWs = new FakeWebSocket(url);
    return currentFakeWs;
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    currentFakeWs = null;

    slackConfig = {
      isConfigured: jest.fn().mockReturnValue(true),
      botToken: 'xoxb-test',
      appToken: 'xapp-test',
    } as any;

    slackApiService = {
      openSocketConnection: jest.fn().mockResolvedValue('wss://wss-primary.slack.com/link-ws'),
    } as any;

    slackMessageHandlerService = {
      handleEvent: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackSocketModeService,
        { provide: SlackConfig, useValue: slackConfig },
        { provide: SlackApiService, useValue: slackApiService },
        {
          provide: SlackMessageHandlerService,
          useValue: slackMessageHandlerService,
        },
      ],
    }).compile();

    service = module.get<SlackSocketModeService>(SlackSocketModeService);
    service.setWebSocketFactory(mockWsFactory);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should skip connect onModuleInit if Slack is not configured', () => {
    slackConfig.isConfigured.mockReturnValue(false);
    service.onModuleInit();
    expect(slackApiService.openSocketConnection).not.toHaveBeenCalled();
    expect(currentFakeWs).toBeNull();
  });

  it('should connect to WebSocket URL onModuleInit when configured', async () => {
    service.onModuleInit();
    await jest.runAllTimersAsync();

    expect(slackApiService.openSocketConnection).toHaveBeenCalled();
    expect(currentFakeWs).not.toBeNull();
    expect(currentFakeWs?.url).toBe('wss://wss-primary.slack.com/link-ws');
  });

  it('should ack envelope FIRST before dispatching to message handler', async () => {
    const callOrder: string[] = [];

    service.onModuleInit();
    await jest.runAllTimersAsync();

    const ws = currentFakeWs!;
    const originalSend = ws.send.bind(ws);
    ws.send = (data: string) => {
      originalSend(data);
      callOrder.push(`ack:${JSON.parse(data).envelope_id}`);
    };

    slackMessageHandlerService.handleEvent.mockImplementation(async (payload) => {
      callOrder.push(`handleEvent:${payload.event_id}`);
    });

    ws.emitMessage({
      envelope_id: 'env-100',
      type: 'events_api',
      payload: {
        event_id: 'evt-100',
        event: { type: 'message', channel_type: 'im', text: 'hello' },
      },
    });

    await Promise.resolve();

    expect(callOrder).toEqual(['ack:env-100', 'handleEvent:evt-100']);
    expect(ws.sentMessages).toContain(JSON.stringify({ envelope_id: 'env-100' }));
  });

  it('should de-duplicate events_api payloads by payload.event_id', async () => {
    service.onModuleInit();
    await jest.runAllTimersAsync();

    const ws = currentFakeWs!;

    const payload = {
      event_id: 'evt-dup-1',
      event: { type: 'message', channel_type: 'im', text: 'test' },
    };

    // First delivery
    ws.emitMessage({
      envelope_id: 'env-1',
      type: 'events_api',
      payload,
    });
    await Promise.resolve();

    // Redelivery (retry)
    ws.emitMessage({
      envelope_id: 'env-2',
      type: 'events_api',
      payload,
    });
    await Promise.resolve();

    // Handler called exactly once
    expect(slackMessageHandlerService.handleEvent).toHaveBeenCalledTimes(1);

    // Both envelopes must be acked so Slack stops retrying
    expect(ws.sentMessages).toEqual([
      JSON.stringify({ envelope_id: 'env-1' }),
      JSON.stringify({ envelope_id: 'env-2' }),
    ]);
  });

  it('should evict oldest event_id when dedupe set exceeds cap (500)', async () => {
    service.onModuleInit();
    await jest.runAllTimersAsync();

    const ws = currentFakeWs!;

    // Emit 501 unique events
    for (let i = 0; i <= 500; i++) {
      ws.emitMessage({
        envelope_id: `env-${i}`,
        type: 'events_api',
        payload: {
          event_id: `evt-${i}`,
          event: { type: 'message', channel_type: 'im', text: `msg ${i}` },
        },
      });
    }

    expect(service.getDedupeSetSize()).toBe(500);

    // evt-0 was evicted, so emitting it again should pass dedupe check and call handler
    slackMessageHandlerService.handleEvent.mockClear();

    ws.emitMessage({
      envelope_id: 'env-evicted-0',
      type: 'events_api',
      payload: {
        event_id: 'evt-0',
        event: { type: 'message', channel_type: 'im', text: 'msg 0 again' },
      },
    });
    await Promise.resolve();

    expect(slackMessageHandlerService.handleEvent).toHaveBeenCalledTimes(1);
  });

  it('should reset exponential backoff after hello envelope', async () => {
    // Fail first connect attempt to double backoff
    slackApiService.openSocketConnection.mockResolvedValueOnce(null);

    await service.connect();
    expect(service.getBackoffMs()).toBe(2000);

    // Connect successfully
    slackApiService.openSocketConnection.mockResolvedValueOnce(
      'wss://wss-primary.slack.com/link-ws',
    );
    await service.connect();

    const ws = currentFakeWs!;
    ws.emitMessage({ type: 'hello' });

    expect(service.getBackoffMs()).toBe(1000);
  });

  it('should not schedule reconnect after onModuleDestroy', async () => {
    service.onModuleInit();
    await jest.runAllTimersAsync();

    const ws = currentFakeWs!;
    service.onModuleDestroy();

    expect(service.isSocketActive()).toBe(false);

    // Simulating socket close callback after destroy
    if (ws.onclose) {
      ws.onclose({} as any);
    }

    jest.runAllTimers();
    expect(slackApiService.openSocketConnection).toHaveBeenCalledTimes(1);
  });

  it('should prevent stacked sockets when connect is called twice', async () => {
    service.onModuleInit();
    await jest.runAllTimersAsync();

    const firstWs = currentFakeWs;
    await service.connect(); // Second connect attempt while active

    expect(currentFakeWs).toBe(firstWs);
    expect(slackApiService.openSocketConnection).toHaveBeenCalledTimes(1);
  });

  it('should handle disconnect envelope by closing socket and reconnecting immediately', async () => {
    service.onModuleInit();
    await jest.runAllTimersAsync();

    const ws = currentFakeWs!;

    slackApiService.openSocketConnection.mockResolvedValueOnce(
      'wss://wss-reconnect.slack.com/link-ws',
    );

    ws.emitMessage({ type: 'disconnect' });
    await jest.runAllTimersAsync();

    expect(slackApiService.openSocketConnection).toHaveBeenCalledTimes(2);
    expect(currentFakeWs?.url).toBe('wss://wss-reconnect.slack.com/link-ws');
  });
});
