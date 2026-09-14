import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ApiException } from '../common/api.exception';
import { NotificationService } from '../notification/notification.service';
import { formatLeadTimeBody, leadTimeFireAt } from '../notification/notification-scheduling';
import { LearningItem } from './learning-item.entity';
import { LearningSubtopic } from './learning-subtopic.entity';
import { LearningTopic } from './learning-topic.entity';
import { ItemRequestDto, ItemResponseDto, LearningReorderItemDto, SubtopicRequestDto, SubtopicResponseDto, TopicRequestDto, TopicResponseDto } from './dto/learning-dtos';

@Injectable()
export class LearningService {
  constructor(
    @InjectRepository(LearningTopic) private readonly topics: Repository<LearningTopic>,
    @InjectRepository(LearningSubtopic) private readonly subtopics: Repository<LearningSubtopic>,
    @InjectRepository(LearningItem) private readonly items: Repository<LearningItem>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationService,
  ) {}

  async listTopics(ownerId: string): Promise<TopicResponseDto[]> {
    const topics = await this.topics.find({ where: { ownerId }, order: { position: 'ASC', id: 'ASC' } });
    if (!topics.length) return [];
    const items = await this.items.find({ where: { topicId: In(topics.map((t) => t.id)) }, order: { position: 'ASC', id: 'ASC' } });
    const subtopics = await this.subtopics.find({ where: { topicId: In(topics.map((t) => t.id)) }, order: { position: 'ASC', id: 'ASC' } });
    const itemsBySubtopicId = new Map<string, LearningItem[]>(); const directItemsByTopicId = new Map<string, LearningItem[]>(); const subtopicsByTopicId = new Map<string, LearningSubtopic[]>();
    for (const item of items) { const map = item.subtopicId ? itemsBySubtopicId : directItemsByTopicId; const key = item.subtopicId ?? item.topicId; const bucket = map.get(key) ?? []; bucket.push(item); map.set(key, bucket); }
    for (const subtopic of subtopics) { const bucket = subtopicsByTopicId.get(subtopic.topicId) ?? []; bucket.push(subtopic); subtopicsByTopicId.set(subtopic.topicId, bucket); }
    return topics.map((topic) => { const topicSubtopics = (subtopicsByTopicId.get(topic.id) ?? []).map((subtopic) => SubtopicResponseDto.from(subtopic, itemsBySubtopicId.get(subtopic.id) ?? [])); return TopicResponseDto.from(topic, directItemsByTopicId.get(topic.id) ?? [], topicSubtopics); });
  }

  async createTopic(ownerId: string, req: TopicRequestDto): Promise<TopicResponseDto> {
    const topic = this.topics.create({ ownerId, title: req.title, description: req.description ?? null, position: await this.nextTopicPosition(ownerId) });
    return TopicResponseDto.from(await this.topics.save(topic), [], []);
  }

  async updateTopic(ownerId: string, id: string, req: TopicRequestDto): Promise<TopicResponseDto> {
    const topic = await this.requireTopic(ownerId, id); topic.title = req.title;
    if (req.description !== undefined) topic.description = req.description ?? null;
    const saved = await this.topics.save(topic);
    const items = await this.items.find({ where: { topicId: saved.id }, order: { position: 'ASC', id: 'ASC' } });
    const subtopics = await this.subtopics.find({ where: { topicId: saved.id }, order: { position: 'ASC', id: 'ASC' } });
    const itemsBySubtopicId = new Map<string, LearningItem[]>(); const directItems: LearningItem[] = [];
    for (const item of items) { if (!item.subtopicId) { directItems.push(item); continue; } const bucket = itemsBySubtopicId.get(item.subtopicId) ?? []; bucket.push(item); itemsBySubtopicId.set(item.subtopicId, bucket); }
    return TopicResponseDto.from(saved, directItems, subtopics.map((subtopic) => SubtopicResponseDto.from(subtopic, itemsBySubtopicId.get(subtopic.id) ?? [])));
  }

  async deleteTopic(ownerId: string, id: string): Promise<void> {
    const topic = await this.requireTopic(ownerId, id); const items = await this.items.find({ where: { topicId: topic.id } });
    for (const item of items) await this.notifications.cancelForSource(ownerId, 'learning', item.id);
    if (items.length) await this.items.softRemove(items); const subtopics = await this.subtopics.find({ where: { topicId: topic.id } }); if (subtopics.length) await this.subtopics.softRemove(subtopics); await this.topics.softRemove(topic);
  }

  async reorderTopics(ownerId: string, items: LearningReorderItemDto[]): Promise<void> {
    if (!items.length) return;
    await this.dataSource.transaction(async (em) => { for (const item of items) await em.createQueryBuilder().update(LearningTopic).set({ position: item.position }).where('id = :id AND owner_id = :ownerId', { id: item.id, ownerId }).execute(); });
  }

  async createSubtopic(ownerId: string, topicId: string, req: SubtopicRequestDto): Promise<SubtopicResponseDto> {
    await this.requireTopic(ownerId, topicId); const subtopic = this.subtopics.create({ topicId, title: req.title, description: req.description ?? null, position: await this.nextSubtopicPosition(topicId) }); return SubtopicResponseDto.from(await this.subtopics.save(subtopic), []);
  }

  async updateSubtopic(ownerId: string, id: string, req: SubtopicRequestDto): Promise<SubtopicResponseDto> {
    const subtopic = await this.requireSubtopic(ownerId, id); subtopic.title = req.title; if (req.description !== undefined) subtopic.description = req.description ?? null;
    const saved = await this.subtopics.save(subtopic); const items = await this.items.find({ where: { subtopicId: saved.id }, order: { position: 'ASC', id: 'ASC' } }); return SubtopicResponseDto.from(saved, items);
  }

  async deleteSubtopic(ownerId: string, id: string): Promise<void> {
    const subtopic = await this.requireSubtopic(ownerId, id); const items = await this.items.find({ where: { subtopicId: subtopic.id } }); for (const item of items) await this.notifications.cancelForSource(ownerId, 'learning', item.id); if (items.length) await this.items.softRemove(items); await this.subtopics.softRemove(subtopic);
  }

  async reorderSubtopics(ownerId: string, topicId: string, items: LearningReorderItemDto[]): Promise<void> {
    await this.requireTopic(ownerId, topicId); if (!items.length) return;
    await this.dataSource.transaction(async (em) => { for (const item of items) await em.createQueryBuilder().update(LearningSubtopic).set({ position: item.position }).where('id = :id AND topic_id = :topicId', { id: item.id, topicId }).execute(); });
  }

  async createItem(ownerId: string, topicId: string, req: ItemRequestDto): Promise<ItemResponseDto> {
    await this.requireTopic(ownerId, topicId);
    if (req.subtopicId) await this.requireSubtopicInTopic(topicId, req.subtopicId);
    const item = this.items.create({ topicId, subtopicId: req.subtopicId ?? null, text: req.text, url: req.url || null, notes: req.notes ?? null, estimatedMinutes: req.estimatedMinutes ?? null, reviewAt: req.reviewAt ? new Date(req.reviewAt) : null, notifyMinutesBefore: req.notifyMinutesBefore ?? null, completedAt: null, position: req.position ?? await this.nextItemPosition(topicId) });
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
    if (req.subtopicId !== undefined) { if (req.subtopicId) await this.requireSubtopicInTopic(item.topicId, req.subtopicId); item.subtopicId = req.subtopicId ?? null; }
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
  private async nextSubtopicPosition(topicId: string): Promise<number> { const last = await this.subtopics.findOne({ where: { topicId }, order: { position: 'DESC' } }); return last ? last.position + 1 : 0; }
  private async nextItemPosition(topicId: string): Promise<number> { const last = await this.items.findOne({ where: { topicId }, order: { position: 'DESC' } }); return last ? last.position + 1 : 0; }
  private async requireTopic(ownerId: string, id: string): Promise<LearningTopic> { const topic = await this.topics.findOne({ where: { id, ownerId } }); if (!topic) throw ApiException.notFound('Learning topic not found'); return topic; }
  private async requireSubtopic(ownerId: string, id: string): Promise<LearningSubtopic> { const subtopic = await this.subtopics.createQueryBuilder('s').innerJoin(LearningTopic, 't', 't.id = s.topic_id AND t.owner_id = :ownerId', { ownerId }).where('s.id = :id', { id }).getOne(); if (!subtopic) throw ApiException.notFound('Learning subtopic not found'); return subtopic; }
  private async requireSubtopicInTopic(topicId: string, subtopicId: string): Promise<LearningSubtopic> { const subtopic = await this.subtopics.findOne({ where: { id: subtopicId } }); if (!subtopic) throw ApiException.notFound('Learning subtopic not found'); if (subtopic.topicId !== topicId) throw ApiException.badRequest('Learning subtopic does not belong to topic'); return subtopic; }
  private async requireItem(ownerId: string, id: string): Promise<LearningItem> { const item = await this.items.createQueryBuilder('i').innerJoin(LearningTopic, 't', 't.id = i.topic_id AND t.owner_id = :ownerId', { ownerId }).where('i.id = :id', { id }).getOne(); if (!item) throw ApiException.notFound('Learning item not found'); return item; }
}
