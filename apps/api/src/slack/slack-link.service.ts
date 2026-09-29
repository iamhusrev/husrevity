import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { SlackLink } from './slack-link.entity';
import { ApiException } from '../common/api.exception';

@Injectable()
export class SlackLinkService {
  constructor(
    @InjectRepository(SlackLink)
    private readonly repo: Repository<SlackLink>,
  ) {}

  /**
   * Generates a single link code for an owner (find-or-create one row per owner).
   * Generates a 6-character uppercase hex code valid for 10 minutes.
   */
  async generateLinkCode(ownerId: string): Promise<SlackLink> {
    let link = await this.repo.findOne({ where: { ownerId } });

    const linkCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    const linkCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    if (!link) {
      link = this.repo.create({
        ownerId,
        linkCode,
        linkCodeExpiresAt,
        status: 'pending',
      });
    } else {
      link.linkCode = linkCode;
      link.linkCodeExpiresAt = linkCodeExpiresAt;
      if (link.status === 'unlinked') {
        link.status = 'pending';
      }
    }

    return this.repo.save(link);
  }

  /**
   * Validates a link code and binds the slackUserId to the owner's Slack link row.
   */
  async confirmLink(code: string, slackUserId: string): Promise<SlackLink> {
    if (!code) {
      throw ApiException.badRequest('Link code is required');
    }

    const normalizedCode = code.trim().toUpperCase();
    const link = await this.repo.findOne({ where: { linkCode: normalizedCode } });

    if (!link) {
      throw ApiException.badRequest('Invalid link code');
    }

    if (link.linkCodeExpiresAt && link.linkCodeExpiresAt < new Date()) {
      throw ApiException.badRequest('Link code has expired');
    }

    // Unlink any existing account linked to this slackUserId if different
    const existingWithSlackUser = await this.repo.findOne({
      where: { slackUserId, status: 'linked' },
    });
    if (existingWithSlackUser && existingWithSlackUser.id !== link.id) {
      existingWithSlackUser.status = 'unlinked';
      existingWithSlackUser.slackUserId = null;
      await this.repo.save(existingWithSlackUser);
    }

    link.slackUserId = slackUserId;
    link.status = 'linked';
    link.linkedAt = new Date();
    link.linkCode = null;
    link.linkCodeExpiresAt = null;

    return this.repo.save(link);
  }

  /**
   * Unlinks a Slack connection by ownerId or slackUserId.
   */
  async unlink(ownerId?: string, slackUserId?: string): Promise<SlackLink> {
    if (!ownerId && !slackUserId) {
      throw ApiException.badRequest('Owner ID or Slack User ID is required');
    }

    const link = ownerId
      ? await this.repo.findOne({ where: { ownerId } })
      : await this.repo.findOne({ where: { slackUserId } });

    if (!link) {
      throw ApiException.notFound('Slack link not found');
    }

    link.status = 'unlinked';
    link.slackUserId = null;
    link.linkCode = null;
    link.linkCodeExpiresAt = null;

    return this.repo.save(link);
  }

  /**
   * Finds the Slack link row for an ownerId.
   */
  async findByOwner(ownerId: string): Promise<SlackLink | null> {
    return this.repo.findOne({ where: { ownerId } });
  }

  /**
   * Finds an active (linked) Slack link row for a slackUserId.
   */
  async findBySlackUser(slackUserId: string): Promise<SlackLink | null> {
    return this.repo.findOne({ where: { slackUserId, status: 'linked' } });
  }
}
