import { Test } from '@nestjs/testing';
import { DictateService } from './dictate.service';
import { GeminiConfig } from './gemini.config';
import { ApiException } from '../common/api.exception';

type MockGeminiConfig = {
  isConfigured: jest.Mock;
  apiKey: string | undefined;
  model: string;
};

describe('DictateService', () => {
  let service: DictateService;
  let gemini: MockGeminiConfig;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(async () => {
    gemini = {
      isConfigured: jest.fn().mockReturnValue(true),
      apiKey: 'test-key',
      model: 'gemini-2.5-flash',
    };

    const module = await Test.createTestingModule({
      providers: [DictateService, { provide: GeminiConfig, useValue: gemini }],
    }).compile();

    service = module.get(DictateService);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function mockGeminiResponse(items: string[]): void {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          { content: { parts: [{ text: JSON.stringify({ items }) }] } },
        ],
      }),
    } as Response);
  }

  describe('splitIntoItems', () => {
    it('returns parsed items on a successful Gemini call', async () => {
      mockGeminiResponse(['Su iç', 'Rapor yaz']);

      const result = await service.splitIntoItems('su ic ve rapor yaz');

      expect(result).toEqual(['Su iç', 'Rapor yaz']);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(String(url)).toContain('gemini-2.5-flash');
      expect(String(url)).toContain('key=test-key');
      expect(init?.method).toBe('POST');
    });

    it('throws ApiException when Gemini responds with a non-OK status', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'boom' }),
      } as Response);

      await expect(service.splitIntoItems('metin')).rejects.toThrow(
        ApiException,
      );
    });

    it('throws ApiException when the fetch call itself rejects', async () => {
      fetchSpy.mockRejectedValue(new Error('network down'));

      await expect(service.splitIntoItems('metin')).rejects.toThrow(
        ApiException,
      );
    });

    it('throws ApiException when Gemini is not configured', async () => {
      gemini.isConfigured.mockReturnValue(false);

      await expect(service.splitIntoItems('metin')).rejects.toThrow(
        ApiException,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
