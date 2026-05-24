import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VaultEntry } from './vault-entity.entity';
import { VaultItem } from './vault-item.entity';
import { CryptoService } from '../crypto/crypto.service';
import { ApiException } from '../common/api.exception';
import {
  EntityRequestDto,
  EntityResponseDto,
  ItemRequestDto,
  ItemResponseDto,
  ItemUpdateRequestDto,
} from './dto/vault-dtos';

@Injectable()
export class VaultService {
  constructor(
    @InjectRepository(VaultEntry) private readonly entries: Repository<VaultEntry>,
    @InjectRepository(VaultItem) private readonly items: Repository<VaultItem>,
    private readonly crypto: CryptoService,
  ) {}

  // ─── Entries ────────────────────────────────────────────────────────────────

  async listEntities(ownerId: string): Promise<EntityResponseDto[]> {
    const rows = await this.entries.find({
      where: { ownerId },
      order: { createdAt: 'DESC' },
    });
    const out: EntityResponseDto[] = [];
    for (const e of rows) {
      const count = await this.items.count({ where: { entityId: e.id } });
      out.push(EntityResponseDto.from(e, count));
    }
    return out;
  }

  async createEntity(ownerId: string, req: EntityRequestDto): Promise<EntityResponseDto> {
    const e = this.entries.create({
      ownerId,
      name: req.name,
      category: req.category ?? null,
      description: req.description ?? null,
      icon: req.icon ?? null,
      color: req.color ?? '#6366F1',
    });
    return EntityResponseDto.from(await this.entries.save(e), 0);
  }

  async updateEntity(
    ownerId: string,
    id: string,
    req: EntityRequestDto,
  ): Promise<EntityResponseDto> {
    const e = await this.requireEntry(ownerId, id);
    e.name = req.name;
    if (req.category !== undefined) e.category = req.category ?? null;
    if (req.description !== undefined) e.description = req.description ?? null;
    if (req.icon !== undefined) e.icon = req.icon ?? null;
    if (req.color !== undefined) e.color = req.color ?? '#6366F1';
    const saved = await this.entries.save(e);
    const count = await this.items.count({ where: { entityId: saved.id } });
    return EntityResponseDto.from(saved, count);
  }

  async deleteEntity(ownerId: string, id: string): Promise<void> {
    const e = await this.requireEntry(ownerId, id);
    await this.entries.softRemove(e);
  }

  // ─── Items ──────────────────────────────────────────────────────────────────

  async listItems(ownerId: string, entityId: string): Promise<ItemResponseDto[]> {
    await this.requireEntry(ownerId, entityId);
    const rows = await this.items.find({
      where: { entityId },
      order: { createdAt: 'ASC' },
    });
    return rows.map((i) => ItemResponseDto.from(i, this.crypto.decrypt(i.encryptedValue) ?? ''));
  }

  async createItem(
    ownerId: string,
    entityId: string,
    req: ItemRequestDto,
  ): Promise<ItemResponseDto> {
    await this.requireEntry(ownerId, entityId);
    const i = this.items.create({
      entityId,
      ownerId,
      label: req.label,
      encryptedValue: this.crypto.encrypt(req.value) ?? '',
      description: req.description ?? null,
    });
    return ItemResponseDto.from(await this.items.save(i), req.value);
  }

  async updateItem(
    ownerId: string,
    itemId: string,
    req: ItemUpdateRequestDto,
  ): Promise<ItemResponseDto> {
    const i = await this.requireItem(ownerId, itemId);
    if (req.label !== undefined) i.label = req.label;
    if (req.value !== undefined) i.encryptedValue = this.crypto.encrypt(req.value) ?? '';
    if (req.description !== undefined) i.description = req.description ?? null;
    const saved = await this.items.save(i);
    return ItemResponseDto.from(saved, this.crypto.decrypt(saved.encryptedValue) ?? '');
  }

  async deleteItem(ownerId: string, itemId: string): Promise<void> {
    const i = await this.requireItem(ownerId, itemId);
    await this.items.softRemove(i);
  }

  // ─── Import / Export ────────────────────────────────────────────────────────

  async importEnv(ownerId: string, entityId: string, rawEnv: string): Promise<ItemResponseDto[]> {
    await this.requireEntry(ownerId, entityId);
    const out: ItemResponseDto[] = [];
    for (const rawLine of rawEnv.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        val.length >= 2 &&
        ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      ) {
        val = val.slice(1, -1);
      }
      out.push(await this.createItem(ownerId, entityId, { label: key, value: val }));
    }
    return out;
  }

  async exportEnv(ownerId: string, entityId: string): Promise<string> {
    await this.requireEntry(ownerId, entityId);
    const rows = await this.items.find({
      where: { entityId },
      order: { createdAt: 'ASC' },
    });
    return rows.map((i) => `${i.label}=${this.crypto.decrypt(i.encryptedValue) ?? ''}`).join('\n');
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async requireEntry(ownerId: string, id: string): Promise<VaultEntry> {
    const e = await this.entries.findOne({ where: { id, ownerId } });
    if (!e) throw ApiException.notFound('Vault entity not found');
    return e;
  }

  private async requireItem(ownerId: string, itemId: string): Promise<VaultItem> {
    const i = await this.items.findOne({ where: { id: itemId, ownerId } });
    if (!i) throw ApiException.notFound('Vault item not found');
    return i;
  }
}
