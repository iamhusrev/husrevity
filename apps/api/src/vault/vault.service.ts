import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { parse } from 'csv-parse';
import { Repository } from 'typeorm';
import { VaultEntry } from './vault-entity.entity';
import { VaultItem } from './vault-item.entity';
import { CryptoService } from '../crypto/crypto.service';
import { ApiException } from '../common/api.exception';
import {
  CsvImportErrorDto,
  CsvImportOptionsDto,
  CsvRecord,
  EntityRequestDto,
  EntityResponseDto,
  ImportResultDto,
  ItemRequestDto,
  ItemResponseDto,
  ItemUpdateRequestDto,
} from './dto/vault-dtos';

const CSV_URL_MAX_LENGTH = 2048;
// VaultItem.label is varchar(255) and stores `${name}:${username}` — leave room
// for the ":" separator between the two.
const CSV_LABEL_MAX_LENGTH = 255;

@Injectable()
export class VaultService {
  private readonly logger = new Logger(VaultService.name);

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

  async importCsv(
    ownerId: string,
    entityId: string,
    csvBuffer: Buffer,
    options: CsvImportOptionsDto,
  ): Promise<ImportResultDto> {
    await this.requireEntry(ownerId, entityId);

    const rawRecords = await this.parseCsv(csvBuffer);
    const { valid, invalid } = this.validateCsvRecords(rawRecords);

    const skipDuplicates = options.skipDuplicates ?? true;
    const deduped = await this.filterDuplicates(ownerId, entityId, valid, skipDuplicates);
    const duplicateSkippedCount = valid.length - deduped.length;

    const created =
      deduped.length > 0 ? await this.bulkCreateItems(ownerId, entityId, deduped) : [];

    this.logger.log(
      `CSV import for entity ${entityId}: ${created.length} created, ${invalid.length} invalid, ${duplicateSkippedCount} duplicates skipped`,
    );

    return {
      totalRows: rawRecords.length,
      successCount: created.length,
      skippedCount: invalid.length + duplicateSkippedCount,
      errors: invalid,
      importedItems: created.map((i) => ({ id: i.id, label: i.label })),
      timestamp: new Date().toISOString(),
    };
  }

  // ─── CSV import helpers ─────────────────────────────────────────────────────

  private parseCsv(buffer: Buffer): Promise<Record<string, string>[]> {
    return new Promise((resolve, reject) => {
      parse(
        buffer,
        {
          columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
          skip_empty_lines: true,
          trim: true,
          relax_column_count: true,
        },
        (err, records: Record<string, string>[]) => {
          if (err) {
            reject(ApiException.badRequest(`Failed to parse CSV: ${err.message}`));
            return;
          }
          resolve(records);
        },
      );
    });
  }

  private validateCsvRecords(records: Record<string, string>[]): {
    valid: CsvRecord[];
    invalid: CsvImportErrorDto[];
  } {
    const valid: CsvRecord[] = [];
    const invalid: CsvImportErrorDto[] = [];

    records.forEach((raw, index) => {
      const row = index + 2; // +1 for 1-based indexing, +1 for the header row
      const name = (raw.name ?? '').trim();
      const url = (raw.url ?? '').trim();
      const username = (raw.username ?? '').trim();
      const password = (raw.password ?? '').trim();

      if (!username) {
        invalid.push({ row, message: 'Missing required field: username' });
        return;
      }
      if (!password) {
        invalid.push({ row, message: 'Missing required field: password' });
        return;
      }
      const label = `${name}:${username}`;
      if (label.length > CSV_LABEL_MAX_LENGTH) {
        invalid.push({
          row,
          message: `Combined "name" and "username" exceed max length of ${CSV_LABEL_MAX_LENGTH} characters`,
        });
        return;
      }
      if (url.length > CSV_URL_MAX_LENGTH) {
        invalid.push({
          row,
          message: `Field "url" exceeds max length of ${CSV_URL_MAX_LENGTH} characters`,
        });
        return;
      }

      valid.push({ name, url: url || undefined, username, password });
    });

    return { valid, invalid };
  }

  private async filterDuplicates(
    ownerId: string,
    entityId: string,
    records: CsvRecord[],
    skipDuplicates: boolean,
  ): Promise<CsvRecord[]> {
    if (!skipDuplicates || records.length === 0) return records;

    const existing = await this.items.find({ where: { entityId, ownerId } });
    const existingLabels = new Set(existing.map((i) => i.label));
    const seenInBatch = new Set<string>();
    const deduped: CsvRecord[] = [];

    for (const record of records) {
      const label = `${record.name}:${record.username}`;
      if (existingLabels.has(label) || seenInBatch.has(label)) continue;
      seenInBatch.add(label);
      deduped.push(record);
    }

    return deduped;
  }

  private async bulkCreateItems(
    ownerId: string,
    entityId: string,
    records: CsvRecord[],
  ): Promise<VaultItem[]> {
    const entities = records.map((r) =>
      this.items.create({
        entityId,
        ownerId,
        label: `${r.name}:${r.username}`,
        encryptedValue: this.crypto.encrypt(r.password) ?? '',
        description: r.url ?? null,
      }),
    );
    return this.items.save(entities);
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
