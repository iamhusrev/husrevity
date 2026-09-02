import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ApiException } from '../common/api.exception';
import { NotificationService } from '../notification/notification.service';
import { formatLeadTimeBody, leadTimeFireAt } from '../notification/notification-scheduling';
import { LearningItem } from './learning-item.entity';
import { LearningTopic } from './learning-topic.entity';
import { ItemRequestDto, ItemResponseDto, LearningReorderItemDto, TopicRequestDto, TopicResponseDto } from './dto/learning-dtos';

@Injectable()
export class LearningService {
  constructor(
    @InjectRepository(LearningTopic) private readonly topics: Repository<LearningTopic>,
    @InjectRepository(LearningItem) private readonly items: Repository<LearningItem>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationService,
  ) {}

  async listTopics(ownerId: string): Promise<TopicResponseDto[]> {
    const topics = await this.topics.find({ where: { ownerId }, order: { position: 'ASC', id: 'ASC' } });
    if (!topics.length) return [];
    const items = await this.items.find({ where: { topicId: In(topics.map((t) => t.id)) }, order: { position: 'ASC', id: 'ASC' } });
    const byTopic = new Map<string, LearningItem[]>();
    for (const item of items) { const bucket = byTopic.get(item.topicId) ?? []; bucket.push(item); byTopic.set(item.topicId, bucket); }
    return topics.map((topic) => TopicResponseDto.from(topic, byTopic.get(topic.id) ?? []));
  }

  async createTopic(ownerId: string, req: TopicRequestDto): Promise<TopicResponseDto> {
    const topic = this.topics.create({ ownerId, title: req.title, description: req.description ?? null, position: await this.nextTopicPosition(ownerId) });
    return TopicResponseDto.from(await this.topics.save(topic), []);
  }

  async updateTopic(ownerId: string, id: string, req: TopicRequestDto): Promise<TopicResponseDto> {
    const topic = await this.requireTopic(ownerId, id); topic.title = req.title;
    if (req.description !== undefined) topic.description = req.description ?? null;
    const saved = await this.topics.save(topic);
    const items = await this.items.find({ where: { topicId: saved.id }, order: { position: 'ASC', id: 'ASC' } });
    return TopicResponseDto.from(saved, items);
  }

  async deleteTopic(ownerId: string, id: string): Promise<void> {
    const topic = await this.requireTopic(ownerId, id); const items = await this.items.find({ where: { topicId: topic.id } });
    for (const item of items) await this.notifications.cancelForSource(ownerId, 'learning', item.id);
    if (items.length) await this.items.softRemove(items); await this.topics.softRemove(topic);
  }

  async reorderTopics(ownerId: string, items: LearningReorderItemDto[]): Promise<void> {
    if (!items.length) return;
    await this.dataSource.transaction(async (em) => { for (const item of items) await em.createQueryBuilder().update(LearningTopic).set({ position: item.position }).where('id = :id AND owner_id = :ownerId', { id: item.id, ownerId }).execute(); });
  }

  async createItem(ownerId: string, topicId: string, req: ItemRequestDto): Promise<ItemResponseDto> {
    await this.requireTopic(ownerId, topicId);
    const item = this.items.create({ topicId, text: req.text, url: req.url || null, notes: req.notes ?? null, estimatedMinutes: req.estimatedMinutes ?? null, reviewAt: req.reviewAt ? new Date(req.reviewAt) : null, notifyMinutesBefore: req.notifyMinutesBefore ?? null, completedAt: null, position: req.position ?? await this.nextItemPosition(topicId) });
    const saved = await this.items.save(item); await this.syncNotification(ownerId, saved); return ItemResponseDto.from(saved);
  }

  async updateItem(ownerId: string, id: string, req: ItemRequestDto): Promise<ItemResponseDto> {
    const item = await this.requireItem(ownerId, id); item.text = req.text;
    if (req.url !== undefined) item.url = req.url || null;
    if (req.notes !== undefined) item.notes = req.notes ?? null;
    if (req.estimatedMinutes !== undefined) item.estimatedMinutes = req.estimatedMinutes ?? null;
    if (req.reviewAt !== undefined) item.reviewAt = req.reviewAt ? new Date(req.reviewAt) : null;
    if (req.notifyMinutesBefore !== undefined) item.notifyMinutesBefore = req.notifyMinutesBefore ?? null;
    if (req.position !== undefined) item.position = req.position;
    const saved = await this.items.save(item); await this.syncNotification(ownerId, saved); return ItemResponseDto.from(saved);
  }

  async toggleItem(ownerId: string, id: string): Promise<ItemResponseDto> {
    const item = await this.requireItem(ownerId, id); item.completedAt = item.completedAt ? null : new Date();
    const saved = await this.items.save(item); await this.syncNotification(ownerId, saved); return ItemResponseDto.from(saved);
  }

  async deleteItem(ownerId: string, id: string): Promise<void> { const item = await this.requireItem(ownerId, id); await this.notifications.cancelForSource(ownerId, 'learning', item.id); await this.items.softRemove(item); }

  async reorderItems(ownerId: string, topicId: string, items: LearningReorderItemDto[]): Promise<void> {
    await this.requireTopic(ownerId, topicId); if (!items.length) return;
    await this.dataSource.transaction(async (em) => { for (const item of items) await em.createQueryBuilder().update(LearningItem).set({ position: item.position }).where('id = :id AND topic_id = :topicId', { id: item.id, topicId }).execute(); });
  }

  private async syncNotification(ownerId: string, item: LearningItem): Promise<void> {
    await this.notifications.cancelForSource(ownerId, 'learning', item.id); if (item.completedAt) return;
    const fireAt = leadTimeFireAt(item.reviewAt, item.notifyMinutesBefore); if (!fireAt || !item.reviewAt) return;
    await this.notifications.enqueue({ ownerId, kind: 'learning', sourceId: item.id, scheduledAt: fireAt, title: item.text, body: formatLeadTimeBody(item.reviewAt, item.notifyMinutesBefore ?? 0, item.notes), deepLink: `/learning?topic=${item.topicId}` });
  }

  private async nextTopicPosition(ownerId: string): Promise<number> { const last = await this.topics.findOne({ where: { ownerId }, order: { position: 'DESC' } }); return last ? last.position + 1 : 0; }
  private async nextItemPosition(topicId: string): Promise<number> { const last = await this.items.findOne({ where: { topicId }, order: { position: 'DESC' } }); return last ? last.position + 1 : 0; }
  private async requireTopic(ownerId: string, id: string): Promise<LearningTopic> { const topic = await this.topics.findOne({ where: { id, ownerId } }); if (!topic) throw ApiException.notFound('Learning topic not found'); return topic; }
  private async requireItem(ownerId: string, id: string): Promise<LearningItem> { const item = await this.items.createQueryBuilder('i').innerJoin(LearningTopic, 't', 't.id = i.topic_id AND t.owner_id = :ownerId', { ownerId }).where('i.id = :id', { id }).getOne(); if (!item) throw ApiException.notFound('Learning item not found'); return item; }
}
