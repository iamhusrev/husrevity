import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Gemini (Generative Language API, API-key auth). Mirrors GoogleOAuthConfig's
 * shape. No Vertex / OAuth — a single GOOGLE_GEMINI_API_KEY.
 */
@Injectable()
export class GeminiConfig {
  constructor(private readonly config: ConfigService) {}

  get apiKey(): string | undefined {
    return this.config.get<string>('GOOGLE_GEMINI_API_KEY') || undefined;
  }

  get model(): string {
    return this.config.get<string>('GOOGLE_GEMINI_MODEL') ?? 'gemini-2.5-flash';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * generateContent request target for a model. The API key travels in the
 * `x-goog-api-key` header, never in the URL, so it cannot leak into proxy,
 * error or access logs.
 */
export function geminiGenerateContentRequest(
  model: string,
  apiKey: string | undefined,
): { url: string; headers: Record<string, string> } {
  return {
    url: `${GEMINI_MODELS_URL}/${model}:generateContent`,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey ?? '',
    },
  };
}
