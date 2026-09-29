import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { TelegramLink } from './telegram-link.entity';
import { ApiException } from '../common/api.exception';

@Injectable()
export class TelegramLinkService {
  constructor(
    @InjectRepository(TelegramLink)
    private readonly repo: Repository<TelegramLink>,
  ) {}

  /**
   * Generates a single link code for an owner (find-or-create one row per owner).
   * Generates a 6-character uppercase hex code valid for 10 minutes.
   */
  async generateLinkCode(ownerId: string): Promise<TelegramLink> {
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
   * Validates a link code and binds the chatId to the owner's Telegram link row.
   */
  async confirmLink(code: string, chatId: string): Promise<TelegramLink> {
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

    // Unlink any existing account linked to this chatId if different
    const existingWithChat = await this.repo.findOne({
      where: { chatId, status: 'linked' },
    });
    if (existingWithChat && existingWithChat.id !== link.id) {
      existingWithChat.status = 'unlinked';
      existingWithChat.chatId = null;
      await this.repo.save(existingWithChat);
    }

    link.chatId = chatId;
    link.status = 'linked';
    link.linkedAt = new Date();
    link.linkCode = null;
    link.linkCodeExpiresAt = null;

    return this.repo.save(link);
  }

  /**
   * Unlinks a Telegram connection by ownerId or chatId.
   */
  async unlink(ownerId?: string, chatId?: string): Promise<TelegramLink> {
    if (!ownerId && !chatId) {
      throw ApiException.badRequest('Owner ID or Chat ID is required');
    }

    // ownerId takes priority when both are given — matches the two real
    // call sites (the authenticated DELETE /telegram/link endpoint passes
    // only ownerId; the bot's /unlink command passes only chatId), never
    // both at once. Looking up by ownerId directly (rather than an OR
    // across both) avoids ever matching chatId against an ownerId value —
    // an earlier version of this method did `{ chatId: ownerId }`, which
    // would accidentally match a row whose actual Telegram chat_id happens
    // to numerically equal this owner's id.
    const link = ownerId
      ? await this.repo.findOne({ where: { ownerId } })
      : await this.repo.findOne({ where: { chatId } });

    if (!link) {
      throw ApiException.notFound('Telegram link not found');
    }

    link.status = 'unlinked';
    link.chatId = null;
    link.linkCode = null;
    link.linkCodeExpiresAt = null;

    return this.repo.save(link);
  }

  /**
   * Finds the Telegram link row for an ownerId.
   */
  async findByOwner(ownerId: string): Promise<TelegramLink | null> {
    return this.repo.findOne({ where: { ownerId } });
  }

  /**
   * Finds an active (linked) Telegram link row for a chatId.
   */
  async findByChatId(chatId: string): Promise<TelegramLink | null> {
    return this.repo.findOne({ where: { chatId, status: 'linked' } });
  }
}
