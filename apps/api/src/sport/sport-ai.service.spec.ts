import { SportAiService } from './sport-ai.service';

describe('SportAiService', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;
  let service: SportAiService;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }),
    } as Response);
    service = new SportAiService(
      { isConfigured: () => true, apiKey: 'test-key', model: 'test-model' } as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('sport_ai_request_sends_key_in_header', async () => {
    const text = await (
      service as unknown as { callGeminiJson(s: string, u: string): Promise<string> }
    ).callGeminiJson('system', 'user');

    expect(text).toBe('[]');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('test-model:generateContent');
    expect(String(url)).not.toContain('key=');
    expect(String(url)).not.toContain('test-key');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      'Content-Type': 'application/json',
      'x-goog-api-key': 'test-key',
    });
  });
});
