import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { PatScope, PersonalAccessToken } from './personal-access-token.entity';
import { ApiException } from '../common/api.exception';

export interface IssuedPat {
  id: string;
  rawToken: string;
}

export interface ValidatedPat {
  ownerId: string;
  scopes: PatScope[];
}

/**
 * Faz 4 Auth v1. Same hashing convention as refresh tokens: only the
 * sha256 hash is ever stored, the raw token is returned exactly once, at
 * issuance — the caller (PatController) is responsible for showing it to
 * the user and never persisting it themselves.
 */
@Injectable()
export class PatService {
  constructor(
    @InjectRepository(PersonalAccessToken) private readonly pats: Repository<PersonalAccessToken>,
  ) {}

  async issue(
    ownerId: string,
    name: string,
    scopes: PatScope[],
    expiresAt?: Date | null,
  ): Promise<IssuedPat> {
    const rawToken = randomBytes(32).toString('base64url');
    const pat = this.pats.create({
      ownerId,
      name,
      tokenHash: this.sha256(rawToken),
      scopes,
      lastUsedAt: null,
      expiresAt: expiresAt ?? null,
    });
    const saved = await this.pats.save(pat);
    return { id: saved.id, rawToken };
  }

  /** Returns null for an unknown, deleted, or expired token — callers never learn which. */
  async validate(rawToken: string): Promise<ValidatedPat | null> {
    const pat = await this.pats.findOne({ where: { tokenHash: this.sha256(rawToken) } });
    if (!pat) return null;
    if (pat.expiresAt && pat.expiresAt.getTime() < Date.now()) return null;
    pat.lastUsedAt = new Date();
    await this.pats.save(pat);
    return { ownerId: pat.ownerId, scopes: pat.scopes };
  }

  async list(ownerId: string): Promise<PersonalAccessToken[]> {
    return this.pats.find({ where: { ownerId }, order: { createdAt: 'DESC' } });
  }

  async revoke(ownerId: string, id: string): Promise<void> {
    const pat = await this.pats.findOne({ where: { id, ownerId } });
    if (!pat) throw ApiException.notFound('Personal access token not found');
    await this.pats.softRemove(pat);
  }

  private sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }
}
