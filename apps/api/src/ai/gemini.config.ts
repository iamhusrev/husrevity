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
