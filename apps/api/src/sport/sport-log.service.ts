import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, Repository } from 'typeorm';
import { SportLog } from './entities/sport-log.entity';
import { SportSession } from './entities/sport-session.entity';
import { ApiException } from '../common/api.exception';
import {
  LogRequestDto,
  LogResponseDto,
  LogUpdateRequestDto,
} from './dto/sport-log.dto';
import { SportStatsDto } from './dto/sport-shared.dto';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_WINDOW_DAYS = 90;

@Injectable()
export class SportLogService {
  constructor(
    @InjectRepository(SportLog)
    private readonly logs: Repository<SportLog>,
  ) {}

  /** Create or update the single log row for (owner, sessionId, executedDate). */
  async logWorkout(ownerId: string, req: LogRequestDto): Promise<LogResponseDto> {
    this.assertDate(req.executedDate, 'executedDate');
    const sessionId = req.sessionId ?? null;

    let log = await this.logs.findOne({
      where: {
        ownerId,
        executedDate: req.executedDate,
        sessionId: sessionId ?? IsNull(),
      },
    });
    if (!log) {
      log = this.logs.create({ ownerId, sessionId, executedDate: req.executedDate });
    }
    log.actualDuration = req.actualDuration;
    log.completed = req.completed;
    log.intensity = req.intensity;
    log.notes = req.notes ?? null;
    log.caloriesBurned = req.caloriesBurned ?? null;
    return LogResponseDto.from(await this.logs.save(log));
  }

  async getLogsForPeriod(ownerId: string, from: string, to: string): Promise<LogResponseDto[]> {
    this.assertDate(from, 'from');
    this.assertDate(to, 'to');
    if (from > to) throw ApiException.badRequest('"from" must be on or before "to"');
    const rows = await this.logs.find({
      where: { ownerId, executedDate: Between(from, to) },
      order: { executedDate: 'ASC', id: 'ASC' },
    });
    return rows.map(LogResponseDto.from);
  }

  async updateLog(ownerId: string, id: string, req: LogUpdateRequestDto): Promise<LogResponseDto> {
    const log = await this.requireLog(ownerId, id);
    if (req.sessionId !== undefined) log.sessionId = req.sessionId ?? null;
    if (req.executedDate !== undefined) {
      this.assertDate(req.executedDate, 'executedDate');
      log.executedDate = req.executedDate;
    }
    if (req.actualDuration !== undefined) log.actualDuration = req.actualDuration;
    if (req.completed !== undefined) log.completed = req.completed;
    if (req.intensity !== undefined) log.intensity = req.intensity;
    if (req.notes !== undefined) log.notes = req.notes ?? null;
    if (req.caloriesBurned !== undefined) log.caloriesBurned = req.caloriesBurned ?? null;
    return LogResponseDto.from(await this.logs.save(log));
  }

  async deleteLog(ownerId: string, id: string): Promise<void> {
    const log = await this.requireLog(ownerId, id);
    await this.logs.softRemove(log);
  }

  /**
   * Aggregated workout stats over [from, to] (defaults to the trailing
   * {@link DEFAULT_WINDOW_DAYS} days). All aggregation happens in SQL.
   */
  async getStats(ownerId: string, from?: string, to?: string): Promise<SportStatsDto> {
    if (from) this.assertDate(from, 'from');
    if (to) this.assertDate(to, 'to');
    const { from: fromDate, to: toDate } = this.resolveWindow(from, to);
    if (fromDate > toDate) throw ApiException.badRequest('"from" must be on or before "to"');

    const totalsRaw = await this.logs
      .createQueryBuilder('l')
      .select('COUNT(*)', 'totalCompleted')
      .addSelect('COALESCE(AVG(l.actual_duration), 0)', 'avgDuration')
      .addSelect('COALESCE(SUM(l.actual_duration), 0)', 'totalMinutes')
      .where('l.owner_id = :ownerId', { ownerId })
      .andWhere('l.executed_date BETWEEN :from AND :to', { from: fromDate, to: toDate })
      .andWhere('l.completed = true')
      .getRawOne<{ totalCompleted: string; avgDuration: string; totalMinutes: string }>();

    const totalCompleted = Number(totalsRaw?.totalCompleted ?? 0);
    const avgDuration = Math.round(Number(totalsRaw?.avgDuration ?? 0));
    const totalHours = Number(totalsRaw?.totalMinutes ?? 0) / 60;

    const activityRaw = await this.logs
      .createQueryBuilder('l')
      .leftJoin(SportSession, 's', 's.id = l.session_id')
      .select("COALESCE(s.activity_type, 'UNKNOWN')", 'activityType')
      .addSelect('COUNT(*)', 'count')
      .where('l.owner_id = :ownerId', { ownerId })
      .andWhere('l.executed_date BETWEEN :from AND :to', { from: fromDate, to: toDate })
      .andWhere('l.completed = true')
      .groupBy('s.activity_type')
      .getRawMany<{ activityType: string; count: string }>();
    const activityBreakdown: Record<string, number> = {};
    for (const r of activityRaw) activityBreakdown[r.activityType] = Number(r.count);

    const intensityRaw = await this.logs
      .createQueryBuilder('l')
      .select('l.intensity', 'intensity')
      .addSelect('COUNT(*)', 'count')
      .where('l.owner_id = :ownerId', { ownerId })
      .andWhere('l.executed_date BETWEEN :from AND :to', { from: fromDate, to: toDate })
      .groupBy('l.intensity')
      .orderBy('l.intensity', 'ASC')
      .getRawMany<{ intensity: number; count: string }>();
    const intensityDist: Record<string, number> = {};
    for (const r of intensityRaw) intensityDist[String(r.intensity)] = Number(r.count);

    const weeklyRaw = await this.logs
      .createQueryBuilder('l')
      .select(
        "TO_CHAR(DATE_TRUNC('week', l.executed_date::timestamp), 'YYYY-MM-DD')",
        'weekStart',
      )
      .addSelect('COALESCE(SUM(l.actual_duration), 0)', 'totalMinutes')
      .where('l.owner_id = :ownerId', { ownerId })
      .andWhere('l.executed_date BETWEEN :from AND :to', { from: fromDate, to: toDate })
      .andWhere('l.completed = true')
      .groupBy("DATE_TRUNC('week', l.executed_date::timestamp)")
      .orderBy("DATE_TRUNC('week', l.executed_date::timestamp)", 'ASC')
      .getRawMany<{ weekStart: string; totalMinutes: string }>();
    const weeklyTrend = weeklyRaw.map((r) => ({
      weekStart: r.weekStart,
      hoursCompleted: Number(r.totalMinutes) / 60,
    }));

    return { totalCompleted, avgDuration, totalHours, activityBreakdown, intensityDist, weeklyTrend };
  }

  private resolveWindow(from?: string, to?: string): { from: string; to: string } {
    if (from && to) return { from, to };
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - DEFAULT_WINDOW_DAYS);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return { from: from ?? iso(start), to: to ?? iso(today) };
  }

  private assertDate(value: string, field: string): void {
    if (!DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
      throw ApiException.badRequest(`"${field}" must be a valid YYYY-MM-DD date`);
    }
  }

  private async requireLog(ownerId: string, id: string): Promise<SportLog> {
    const log = await this.logs.findOne({ where: { id, ownerId } });
    if (!log) throw ApiException.notFound('Sport log not found');
    return log;
  }
}
