import { AiSuggestionService } from './ai-suggestion.service';

const VALID_RESPONSE = JSON.stringify([
  {
    title: 'Plan the week',
    description: 'Write down three goals for the week.',
    kind: 'task',
    sourceRef: null,
    reasonShort: 'Test',
  },
]);

describe('AiSuggestionService', () => {
  const ownerId = '1';
  let today: { currentBlockForAi: jest.Mock };
  let service: AiSuggestionService;
  let fetchMock: jest.Mock;
  const realFetch = global.fetch;

  const sentPrompt = (): string => {
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    return JSON.stringify(body);
  };

  beforeEach(() => {
    today = { currentBlockForAi: jest.fn().mockResolvedValue(null) };
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: VALID_RESPONSE }] } }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    service = new AiSuggestionService(
      { isConfigured: () => true, apiKey: 'test-key', model: 'test-model' } as never,
      { list: jest.fn().mockResolvedValue([]) } as never,
      {
        listReminderLists: jest.fn().mockResolvedValue([]),
        listReminders: jest.fn().mockResolvedValue([]),
      } as never,
      { listOwned: jest.fn().mockResolvedValue([]) } as never,
      { listForProject: jest.fn().mockResolvedValue([]) } as never,
      today as never,
    );
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  describe('suggestion_request_sends_key_in_header', () => {
    it('keeps the API key out of the URL and puts it in x-goog-api-key', async () => {
      await service.suggest(ownerId, { mode: 'task', count: 3 });

      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain('test-model:generateContent');
      expect(String(url)).not.toContain('key=');
      expect(String(url)).not.toContain('test-key');
      expect(init.headers).toEqual({
        'Content-Type': 'application/json',
        'x-goog-api-key': 'test-key',
      });
    });
  });

  describe('ai_ignores_google_block_title', () => {
    it('never sends a client-supplied activeBlockTitle to Gemini', async () => {
      await service.suggest(ownerId, {
        mode: 'task',
        count: 3,
        activeBlockTitle: 'Dentist with Alice (from Google Calendar)',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sentPrompt()).not.toContain('Dentist with Alice');
      expect(sentPrompt()).not.toContain('active Evkat block');
    });

    it('uses only the server-computed non-Google block title', async () => {
      today.currentBlockForAi.mockResolvedValue({
        itemId: '9',
        title: 'Deep work',
        scheduledAt: new Date().toISOString(),
        durationMin: 60,
      });

      await service.suggest(ownerId, {
        mode: 'task',
        count: 3,
        activeBlockTitle: 'Private Google meeting',
      });

      expect(today.currentBlockForAi).toHaveBeenCalledWith(ownerId);
      expect(sentPrompt()).toContain('Deep work');
      expect(sentPrompt()).not.toContain('Private Google meeting');
    });

    it('does not let the client title influence the cache key', async () => {
      await service.suggest(ownerId, { mode: 'task', count: 3, activeBlockTitle: 'A' });
      await service.suggest(ownerId, { mode: 'task', count: 3, activeBlockTitle: 'B' });

      // Same server state => second call is served from the cache.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
