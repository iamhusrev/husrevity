import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { RoutineSegment } from './routine-segment.entity';
import { RoutineActivity } from './routine-activity.entity';
import { ApiException } from '../common/api.exception';
import {
  ActivityRequestDto,
  ActivityResponseDto,
  RoutineReorderItemDto,
  SegmentRequestDto,
  SegmentResponseDto,
} from './dto/routine-dtos';

@Injectable()
export class RoutineService {
  constructor(
    @InjectRepository(RoutineSegment)
    private readonly segments: Repository<RoutineSegment>,
    @InjectRepository(RoutineActivity)
    private readonly activities: Repository<RoutineActivity>,
    private readonly dataSource: DataSource,
  ) {}

  async listSegments(ownerId: string): Promise<SegmentResponseDto[]> {
    const segments = await this.segments.find({
      where: { ownerId },
      order: { position: 'ASC', id: 'ASC' },
    });
    if (!segments.length) return [];
    const activities = await this.activities.find({
      where: { segmentId: In(segments.map((s) => s.id)) },
      order: { position: 'ASC', id: 'ASC' },
    });
    const bySegment = new Map<string, RoutineActivity[]>();
    for (const a of activities) {
      const bucket = bySegment.get(a.segmentId) ?? [];
      bucket.push(a);
      bySegment.set(a.segmentId, bucket);
    }
    return segments.map((s) => SegmentResponseDto.from(s, bySegment.get(s.id) ?? []));
  }

  async createSegment(ownerId: string, req: SegmentRequestDto): Promise<SegmentResponseDto> {
    this.validateBounds(req.startMinute ?? null, req.endMinute ?? null);
    const nextPosition = await this.nextSegmentPosition(ownerId);
    const s = this.segments.create({
      ownerId,
      name: req.name,
      startMinute: req.startMinute ?? null,
      endMinute: req.endMinute ?? null,
      theme: req.theme ?? null,
      colorToken: req.colorToken ?? null,
      notes: req.notes ?? null,
      position: nextPosition,
    });
    return SegmentResponseDto.from(await this.segments.save(s), []);
  }

  async updateSegment(
    ownerId: string,
    id: string,
    req: SegmentRequestDto,
  ): Promise<SegmentResponseDto> {
    const s = await this.requireSegment(ownerId, id);
    const start = req.startMinute !== undefined ? req.startMinute ?? null : s.startMinute;
    const end = req.endMinute !== undefined ? req.endMinute ?? null : s.endMinute;
    this.validateBounds(start, end);
    s.name = req.name;
    s.startMinute = start;
    s.endMinute = end;
    if (req.theme !== undefined) s.theme = req.theme ?? null;
    if (req.colorToken !== undefined) s.colorToken = req.colorToken ?? null;
    if (req.notes !== undefined) s.notes = req.notes ?? null;
    const saved = await this.segments.save(s);
    const activities = await this.activities.find({
      where: { segmentId: saved.id },
      order: { position: 'ASC', id: 'ASC' },
    });
    return SegmentResponseDto.from(saved, activities);
  }

  async deleteSegment(ownerId: string, id: string): Promise<void> {
    const s = await this.requireSegment(ownerId, id);
    const activities = await this.activities.find({ where: { segmentId: s.id } });
    if (activities.length) await this.activities.softRemove(activities);
    await this.segments.softRemove(s);
  }

  async reorderSegments(ownerId: string, items: RoutineReorderItemDto[]): Promise<void> {
    if (!items.length) return;
    await this.dataSource.transaction(async (em) => {
      for (const it of items) {
        await em
          .createQueryBuilder()
          .update(RoutineSegment)
          .set({ position: it.position })
          .where('id = :id AND owner_id = :ownerId', { id: it.id, ownerId })
          .execute();
      }
    });
  }

  async createActivity(
    ownerId: string,
    segmentId: string,
    req: ActivityRequestDto,
  ): Promise<ActivityResponseDto> {
    await this.requireSegment(ownerId, segmentId);
    const a = this.activities.create({
      segmentId,
      text: req.text,
      position: req.position ?? (await this.nextActivityPosition(segmentId)),
    });
    return ActivityResponseDto.from(await this.activities.save(a));
  }

  async updateActivity(
    ownerId: string,
    activityId: string,
    req: ActivityRequestDto,
  ): Promise<ActivityResponseDto> {
    const a = await this.requireActivity(ownerId, activityId);
    a.text = req.text;
    if (req.position !== undefined) a.position = req.position;
    return ActivityResponseDto.from(await this.activities.save(a));
  }

  async deleteActivity(ownerId: string, activityId: string): Promise<void> {
    const a = await this.requireActivity(ownerId, activityId);
    await this.activities.softRemove(a);
  }

  async reorderActivities(
    ownerId: string,
    segmentId: string,
    items: RoutineReorderItemDto[],
  ): Promise<void> {
    await this.requireSegment(ownerId, segmentId);
    if (!items.length) return;
    await this.dataSource.transaction(async (em) => {
      for (const it of items) {
        await em
          .createQueryBuilder()
          .update(RoutineActivity)
          .set({ position: it.position })
          .where('id = :id AND segment_id = :segmentId', { id: it.id, segmentId })
          .execute();
      }
    });
  }

  private validateBounds(start: number | null, end: number | null): void {
    if (start !== null && end !== null && end <= start) {
      throw ApiException.badRequest('endMinute must be greater than startMinute');
    }
  }

  private async nextSegmentPosition(ownerId: string): Promise<number> {
    const last = await this.segments.findOne({
      where: { ownerId },
      order: { position: 'DESC' },
    });
    return last ? last.position + 1 : 0;
  }

  private async nextActivityPosition(segmentId: string): Promise<number> {
    const last = await this.activities.findOne({
      where: { segmentId },
      order: { position: 'DESC' },
    });
    return last ? last.position + 1 : 0;
  }

  private async requireSegment(ownerId: string, id: string): Promise<RoutineSegment> {
    const s = await this.segments.findOne({ where: { id, ownerId } });
    if (!s) throw ApiException.notFound('Routine segment not found');
    return s;
  }

  private async requireActivity(ownerId: string, activityId: string): Promise<RoutineActivity> {
    const a = await this.activities
      .createQueryBuilder('a')
      .innerJoin(
        RoutineSegment,
        's',
        's.id = a.segment_id AND s.owner_id = :ownerId',
        { ownerId },
      )
      .where('a.id = :activityId', { activityId })
      .getOne();
    if (!a) throw ApiException.notFound('Routine activity not found');
    return a;
  }
}
