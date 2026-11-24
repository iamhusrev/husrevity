import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PublicLegalIdentity {
  operatorName: string | null;
  contactEmail: string | null;
}

/**
 * Exposes the legal identity shown on the public privacy and terms pages.
 * Values come only from env (LEGAL_OPERATOR_NAME, LEGAL_CONTACT_EMAIL); a
 * missing or blank value is returned as null and never replaced by a default.
 */
@Injectable()
export class PublicLegalService {
  constructor(private readonly config: ConfigService) {}

  getIdentity(): PublicLegalIdentity {
    return {
      operatorName: this.read('LEGAL_OPERATOR_NAME'),
      contactEmail: this.read('LEGAL_CONTACT_EMAIL'),
    };
  }

  private read(key: string): string | null {
    const value = this.config.get<string>(key);
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
