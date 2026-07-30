import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from './plan.entity';
import { PlanItem } from './plan-item.entity';
import { ApiException } from '../common/api.exception';
import {
  PlanItemRequestDto,
  PlanItemResponseDto,
  PlanRequestDto,
  PlanResponseDto,
} from './dto/plan-dtos';

@Injectable()
export class PlanService {
  constructor(
    @InjectRepository(Plan) private readonly plans: Repository<Plan>,
    @InjectRepository(PlanItem) private readonly items: Repository<PlanItem>,
  ) {}

  async list(ownerId: string): Promise<PlanResponseDto[]> {
    const rows = await this.plans.find({
      where: { ownerId },
      order: { updatedAt: 'DESC' },
    });
    return rows.map(PlanResponseDto.from);
  }

  async get(ownerId: string, id: string): Promise<PlanResponseDto> {
    return PlanResponseDto.from(await this.requirePlan(ownerId, id));
  }

  async create(ownerId: string, req: PlanRequestDto): Promise<PlanResponseDto> {
    const p = this.plans.create({
      ownerId,
      title: req.title,
      description: req.description ?? null,
      targetDate: req.targetDate ?? null,
      status: req.status ?? 'ACTIVE',
    });
    return PlanResponseDto.from(await this.plans.save(p));
  }

  async update(ownerId: string, id: string, req: PlanRequestDto): Promise<PlanResponseDto> {
    const p = await this.requirePlan(ownerId, id);
    p.title = req.title;
    if (req.description !== undefined) p.description = req.description ?? null;
    if (req.targetDate !== undefined) p.targetDate = req.targetDate ?? null;
    if (req.status !== undefined) p.status = req.status;
    return PlanResponseDto.from(await this.plans.save(p));
  }

  async delete(ownerId: string, id: string): Promise<void> {
    const p = await this.requirePlan(ownerId, id);
    await this.plans.softRemove(p);
  }

  async restore(ownerId: string, id: string): Promise<PlanResponseDto> {
    const p = await this.plans.findOne({ where: { id, ownerId }, withDeleted: true });
    if (!p || !p.deletedAt) throw ApiException.notFound('Plan not found');
    await this.plans.restore({ id, ownerId });
    return PlanResponseDto.from(await this.requirePlan(ownerId, id));
  }

  async listItems(ownerId: string, planId: string): Promise<PlanItemResponseDto[]> {
    await this.requirePlan(ownerId, planId);
    const rows = await this.items.find({
      where: { planId },
      order: { orderIndex: 'ASC', id: 'ASC' },
    });
    return rows.map(PlanItemResponseDto.from);
  }

  async createItem(
    ownerId: string,
    planId: string,
    req: PlanItemRequestDto,
  ): Promise<PlanItemResponseDto> {
    await this.requirePlan(ownerId, planId);
    const i = this.items.create({
      planId,
      title: req.title,
      done: req.done ?? false,
      targetDate: req.targetDate ?? null,
      orderIndex: req.orderIndex ?? 0,
    });
    return PlanItemResponseDto.from(await this.items.save(i));
  }

  async updateItem(
    ownerId: string,
    itemId: string,
    req: PlanItemRequestDto,
  ): Promise<PlanItemResponseDto> {
    const i = await this.requireItem(ownerId, itemId);
    i.title = req.title;
    if (req.done !== undefined) i.done = req.done;
    if (req.targetDate !== undefined) i.targetDate = req.targetDate ?? null;
    if (req.orderIndex !== undefined) i.orderIndex = req.orderIndex;
    return PlanItemResponseDto.from(await this.items.save(i));
  }

  async deleteItem(ownerId: string, itemId: string): Promise<void> {
    const i = await this.requireItem(ownerId, itemId);
    await this.items.softRemove(i);
  }

  async restoreItem(ownerId: string, itemId: string): Promise<PlanItemResponseDto> {
    await this.requireDeletedItem(ownerId, itemId);
    await this.items.restore({ id: itemId });
    const restored = await this.requireItem(ownerId, itemId);
    return PlanItemResponseDto.from(restored);
  }

  private async requirePlan(ownerId: string, id: string): Promise<Plan> {
    const p = await this.plans.findOne({ where: { id, ownerId } });
    if (!p) throw ApiException.notFound('Plan not found');
    return p;
  }

  private async requireItem(ownerId: string, itemId: string): Promise<PlanItem> {
    const i = await this.items
      .createQueryBuilder('i')
      .innerJoin(Plan, 'p', 'p.id = i.plan_id AND p.owner_id = :ownerId', { ownerId })
      .where('i.id = :itemId', { itemId })
      .getOne();
    if (!i) throw ApiException.notFound('Plan item not found');
    return i;
  }

  private async requireDeletedItem(ownerId: string, itemId: string): Promise<PlanItem> {
    const i = await this.items
      .createQueryBuilder('i')
      .innerJoin(Plan, 'p', 'p.id = i.plan_id AND p.owner_id = :ownerId', { ownerId })
      .where('i.id = :itemId', { itemId })
      .withDeleted()
      .getOne();
    if (!i || !i.deletedAt) throw ApiException.notFound('Plan item not found');
    return i;
  }
}
