import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, Repository } from 'typeorm';
import { ReadingTrack } from './reading-track.entity';
import { ReadingLog } from './reading-log.entity';
import { ApiException } from '../common/api.exception';
import {
  LogRequestDto,
  LogResponseDto,
  ReadingReorderItemDto,
  TrackRequestDto,
  TrackResponseDto,
} from './dto/reading-dtos';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class ReadingService {
  constructor(
    @InjectRepository(ReadingTrack)
    private readonly tracks: Repository<ReadingTrack>,
    @InjectRepository(ReadingLog)
    private readonly logs: Repository<ReadingLog>,
    private readonly dataSource: DataSource,
  ) {}

  async listTracks(ownerId: string): Promise<TrackResponseDto[]> {
    const rows = await this.tracks.find({
      where: { ownerId },
      order: { position: 'ASC', id: 'ASC' },
    });
    return rows.map(TrackResponseDto.from);
  }

  async createTrack(ownerId: string, req: TrackRequestDto): Promise<TrackResponseDto> {
    const t = this.tracks.create({
      ownerId,
      name: req.name,
      colorToken: req.colorToken ?? null,
      tracksListened: req.tracksListened ?? false,
      dailyTarget: req.dailyTarget ?? null,
      cadence: req.cadence ?? 'DAILY',
      position: await this.nextTrackPosition(ownerId),
    });
    return TrackResponseDto.from(await this.tracks.save(t));
  }

  async updateTrack(ownerId: string, id: string, req: TrackRequestDto): Promise<TrackResponseDto> {
    const t = await this.requireTrack(ownerId, id);
    t.name = req.name;
    if (req.colorToken !== undefined) t.colorToken = req.colorToken ?? null;
    if (req.tracksListened !== undefined) t.tracksListened = req.tracksListened;
    if (req.dailyTarget !== undefined) t.dailyTarget = req.dailyTarget ?? null;
    if (req.cadence !== undefined) t.cadence = req.cadence;
    return TrackResponseDto.from(await this.tracks.save(t));
  }

  async deleteTrack(ownerId: string, id: string): Promise<void> {
    const t = await this.requireTrack(ownerId, id);
    const logs = await this.logs.find({ where: { trackId: t.id } });
    if (logs.length) await this.logs.softRemove(logs);
    await this.tracks.softRemove(t);
  }

  async reorderTracks(ownerId: string, items: ReadingReorderItemDto[]): Promise<void> {
    if (!items.length) return;
    await this.dataSource.transaction(async (em) => {
      for (const it of items) {
        await em
          .createQueryBuilder()
          .update(ReadingTrack)
          .set({ position: it.position })
          .where('id = :id AND owner_id = :ownerId', { id: it.id, ownerId })
          .execute();
      }
    });
  }

  /** All logs for the owner's tracks within the inclusive [from, to] date window. */
  async listLogs(ownerId: string, from: string, to: string): Promise<LogResponseDto[]> {
    this.assertDate(from, 'from');
    this.assertDate(to, 'to');
    if (from > to) throw ApiException.badRequest('"from" must be on or before "to"');
    const tracks = await this.tracks.find({ where: { ownerId }, select: { id: true } });
    if (!tracks.length) return [];
    const rows = await this.logs.find({
      where: { trackId: In(tracks.map((t) => t.id)), logDate: Between(from, to) },
      order: { logDate: 'ASC', id: 'ASC' },
    });
    return rows.map(LogResponseDto.from);
  }

  /** Create or update the single log row for (track, date). */
  async upsertLog(
    ownerId: string,
    trackId: string,
    date: string,
    req: LogRequestDto,
  ): Promise<LogResponseDto> {
    this.assertDate(date, 'date');
    await this.requireTrack(ownerId, trackId);
    let log = await this.logs.findOne({ where: { trackId, logDate: date } });
    if (!log) {
      log = this.logs.create({
        trackId,
        logDate: date,
        pageRange: null,
        read: false,
        listened: false,
      });
    }
    if (req.pageRange !== undefined) log.pageRange = req.pageRange?.trim() || null;
    if (req.read !== undefined) log.read = req.read;
    if (req.listened !== undefined) log.listened = req.listened;
    return LogResponseDto.from(await this.logs.save(log));
  }

  async deleteLog(ownerId: string, trackId: string, date: string): Promise<void> {
    this.assertDate(date, 'date');
    await this.requireTrack(ownerId, trackId);
    const log = await this.logs.findOne({ where: { trackId, logDate: date } });
    if (!log) return; // idempotent, no-op if not found
    await this.logs.softRemove(log);
  }

  private assertDate(value: string, field: string): void {
    if (!DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
      throw ApiException.badRequest(`"${field}" must be a valid YYYY-MM-DD date`);
    }
  }

  private async nextTrackPosition(ownerId: string): Promise<number> {
    const last = await this.tracks.findOne({
      where: { ownerId },
      order: { position: 'DESC' },
    });
    return last ? last.position + 1 : 0;
  }

  private async requireTrack(ownerId: string, id: string): Promise<ReadingTrack> {
    const t = await this.tracks.findOne({ where: { id, ownerId } });
    if (!t) throw ApiException.notFound('Reading track not found');
    return t;
  }
}
