import { Injectable, Logger } from '@nestjs/common';
import { ApiException } from '../common/api.exception';
import { parseDictatedItems } from './dictate-parser';
import { GeminiConfig } from './gemini.config';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

@Injectable()
export class DictateService {
  private readonly logger = new Logger(DictateService.name);

  constructor(private readonly gemini: GeminiConfig) {}

  async splitIntoItems(text: string): Promise<string[]> {
    if (!this.gemini.isConfigured()) {
      throw ApiException.badRequest(
        'AI is not configured. Set GOOGLE_GEMINI_API_KEY in apps/api/.env.',
      );
    }

    const system = [
      'Split the given free-form dictated text into short, action-oriented, separate to-do items.',
      'Preserve the original language of the input text.',
      "Strip filler words and dictation artifacts, such as 'um', 'uh', false starts, and repeated words.",
      'Return ONLY a JSON object of the exact shape {"items": ["...", "..."]}. No markdown fences or extra commentary.',
    ].join('\n');

    const raw = await this.callGeminiJson(system, text);
    return parseDictatedItems(raw);
  }

  private async callGeminiJson(system: string, user: string): Promise<string> {
    const url = `${GEMINI_URL}/${this.gemini.model}:generateContent?key=${this.gemini.apiKey}`;
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
        }),
      });
      const json = (await r.json()) as Record<string, unknown>;
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}: ${JSON.stringify(json).slice(0, 200)}`);
      }
      const candidates =
        (json.candidates as
          | { content?: { parts?: { text?: string }[] } }[]
          | undefined) ?? [];
      const text =
        candidates[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (!text) throw new Error('empty response');
      return text;
    } catch (e) {
      this.logger.error('Gemini suggestion call failed', e as Error);
      throw ApiException.badRequest(
        `AI request failed: ${(e as Error).message}`,
      );
    }
  }
}
