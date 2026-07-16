import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, CipherGCM, DecipherGCM } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Port of com.husrevity.common.CryptoUtil. AES-256-GCM with a 32-byte key
 * supplied as base64 in HUSREVITY_CRYPTO_KEY. Output format: base64(IV || ciphertext || tag).
 *
 * Used by the Vault module (Phase 2).
 * Lives in apps/api/src/crypto/ as foundation infrastructure available now.
 */
@Injectable()
export class CryptoService implements OnModuleInit {
  private readonly logger = new Logger(CryptoService.name);
  private key!: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const keyB64 = this.config.get<string>('HUSREVITY_CRYPTO_KEY');
    if (!keyB64 || keyB64.startsWith('replace-')) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'HUSREVITY_CRYPTO_KEY missing or placeholder. Generate: openssl rand -base64 32',
        );
      }
      this.logger.warn(
        'HUSREVITY_CRYPTO_KEY missing — generating ephemeral key (data encrypted now will not decrypt after restart). DO NOT do this in prod.',
      );
      this.key = randomBytes(32);
      return;
    }
    const buf = Buffer.from(keyB64, 'base64');
    if (buf.length !== 32) {
      throw new Error(
        `HUSREVITY_CRYPTO_KEY must be 32 bytes after base64 decoding (got ${buf.length})`,
      );
    }
    this.key = buf;
  }

  encrypt(plaintext: string | null): string | null {
    if (plaintext === null || plaintext === undefined) return null;
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGO, this.key, iv) as CipherGCM;
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, enc, tag]).toString('base64');
  }

  decrypt(payload: string | null): string | null {
    if (payload === null || payload === undefined) return null;
    const buf = Buffer.from(payload, 'base64');
    if (buf.length < IV_LENGTH + TAG_LENGTH) {
      throw new Error('Invalid ciphertext payload');
    }
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(buf.length - TAG_LENGTH);
    const enc = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH);
    const decipher = createDecipheriv(ALGO, this.key, iv) as DecipherGCM;
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  }
}
