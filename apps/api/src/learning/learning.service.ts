import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  EntityTarget,
  In,
  IsNull,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import { ApiException } from '../common/api.exception';
import { NotificationService } from '../notification/notification.service';
import { formatLeadTimeBody, leadTimeFireAt } from '../notification/notification-scheduling';
import { LearningItem } from './learning-item.entity';
import { LearningSubtopic } from './learning-subtopic.entity';
import { LearningTopic } from './learning-topic.entity';
import {
  assertExactSet,
  fillSlots,
  insertAt,
  PositionChange,
  planRenumber,
} from './learning-order';
import {
  ItemRequestDto,
  ItemResponseDto,
  LearningReorderRequestDto,
  MoveItemRequestDto,
  SubtopicRequestDto,
  SubtopicResponseDto,
  TopicReorderRequestDto,
  TopicRequestDto,
  TopicResponseDto,
  yearInIstanbul,
} from './dto/learning-dtos';

/** A missing (or deleted) parent means "restore it first"; any other failure is a real error. */
function rethrowAsParentMissing(error: unknown): never {
  if (error instanceof ApiException && error.getStatus() === 404)
    throw ApiException.badRequest('Restore the parent topic first');
  throw error;
}

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
    const topics = await this.topics.find({
      where: { ownerId },
      order: { position: 'ASC', id: 'ASC' },
    });
    if (!topics.length) return [];
    const items = await this.items.find({
      where: { topicId: In(topics.map((t) => t.id)) },
      order: { position: 'ASC', id: 'ASC' },
    });
    const subtopics = await this.subtopics.find({
      where: { topicId: In(topics.map((t) => t.id)) },
      order: { position: 'ASC', id: 'ASC' },
    });
    const itemsBySubtopicId = new Map<string, LearningItem[]>();
    const directItemsByTopicId = new Map<string, LearningItem[]>();
    const subtopicsByTopicId = new Map<string, LearningSubtopic[]>();
    for (const item of items) {
      const map = item.subtopicId ? itemsBySubtopicId : directItemsByTopicId;
      const key = item.subtopicId ?? item.topicId;
      const bucket = map.get(key) ?? [];
      bucket.push(item);
      map.set(key, bucket);
    }
    for (const subtopic of subtopics) {
      const bucket = subtopicsByTopicId.get(subtopic.topicId) ?? [];
      bucket.push(subtopic);
      subtopicsByTopicId.set(subtopic.topicId, bucket);
    }
    return topics.map((topic) => {
      const topicSubtopics = (subtopicsByTopicId.get(topic.id) ?? []).map((subtopic) =>
        SubtopicResponseDto.from(subtopic, itemsBySubtopicId.get(subtopic.id) ?? []),
      );
      return TopicResponseDto.from(topic, directItemsByTopicId.get(topic.id) ?? [], topicSubtopics);
    });
  }

  async createTopic(ownerId: string, req: TopicRequestDto): Promise<TopicResponseDto> {
    const topic = this.topics.create({
      ownerId,
      title: req.title,
      description: req.description ?? null,
      year: req.year ?? null,
      position: await this.nextTopicPosition(ownerId),
    });
    return TopicResponseDto.from(await this.topics.save(topic), [], []);
  }

  async updateTopic(ownerId: string, id: string, req: TopicRequestDto): Promise<TopicResponseDto> {
    const topic = await this.requireTopic(ownerId, id);
    topic.title = req.title;
    if (req.description !== undefined) topic.description = req.description ?? null;
    if (req.year !== undefined) topic.year = req.year ?? null;
    return this.toTopicDto(await this.topics.save(topic));
  }

  async getTopic(ownerId: string, id: string): Promise<TopicResponseDto> {
    return this.toTopicDto(await this.requireTopic(ownerId, id));
  }

  async getSubtopic(ownerId: string, id: string): Promise<SubtopicResponseDto> {
    return this.toSubtopicDto(await this.requireSubtopic(ownerId, id));
  }

  async getItem(ownerId: string, id: string): Promise<ItemResponseDto> {
    return ItemResponseDto.from(await this.requireItem(ownerId, id));
  }

  private async toTopicDto(topic: LearningTopic): Promise<TopicResponseDto> {
    const items = await this.items.find({
      where: { topicId: topic.id },
      order: { position: 'ASC', id: 'ASC' },
    });
    const subtopics = await this.subtopics.find({
      where: { topicId: topic.id },
      order: { position: 'ASC', id: 'ASC' },
    });
    const itemsBySubtopicId = new Map<string, LearningItem[]>();
    const directItems: LearningItem[] = [];
    for (const item of items) {
      if (!item.subtopicId) {
        directItems.push(item);
        continue;
      }
      const bucket = itemsBySubtopicId.get(item.subtopicId) ?? [];
      bucket.push(item);
      itemsBySubtopicId.set(item.subtopicId, bucket);
    }
    return TopicResponseDto.from(
      topic,
      directItems,
      subtopics.map((subtopic) =>
        SubtopicResponseDto.from(subtopic, itemsBySubtopicId.get(subtopic.id) ?? []),
      ),
    );
  }

  private async toSubtopicDto(subtopic: LearningSubtopic): Promise<SubtopicResponseDto> {
    const items = await this.items.find({
      where: { subtopicId: subtopic.id },
      order: { position: 'ASC', id: 'ASC' },
    });
    return SubtopicResponseDto.from(subtopic, items);
  }

  /** Soft-deletes a topic with its subtopics and items, all under one deleted_at stamp. */
  async deleteTopic(ownerId: string, id: string): Promise<void> {
    const topic = await this.requireTopic(ownerId, id);
    const items = await this.items.find({ where: { topicId: topic.id } });
    for (const item of items)
      await this.notifications.cancelForSource(ownerId, 'learning', item.id);
    const at = new Date();
    await this.dataSource.transaction(async (em) => {
      await this.stamp(em, LearningItem, 'topic_id = :parent AND deleted_at IS NULL', topic.id, at);
      await this.stamp(
        em,
        LearningSubtopic,
        'topic_id = :parent AND deleted_at IS NULL',
        topic.id,
        at,
      );
      await this.stamp(em, LearningTopic, 'id = :parent', topic.id, at);
    });
  }

  /** Restores a deleted topic at the end of the list, with the children deleted together with it. */
  async restoreTopic(ownerId: string, id: string): Promise<TopicResponseDto> {
    const topic = await this.topics.findOne({ where: { id, ownerId }, withDeleted: true });
    if (!topic) throw ApiException.notFound('Learning topic not found');
    const at = this.requireDeletedAt(topic.deletedAt, 'Learning topic');
    const position = await this.nextTopicPosition(ownerId);
    await this.dataSource.transaction(async (em) => {
      await this.unstamp(em, LearningTopic, 'id = :parent', topic.id, at, { position });
      await this.unstamp(
        em,
        LearningSubtopic,
        'topic_id = :parent AND deleted_at = :at',
        topic.id,
        at,
      );
      await this.unstamp(em, LearningItem, 'topic_id = :parent AND deleted_at = :at', topic.id, at);
    });
    await this.resyncTopicNotifications(ownerId, topic.id);
    return this.getTopic(ownerId, topic.id);
  }

  /**
   * Reorders the owner's topics. Without `year`, `orderedIds` is every owned topic.
   * With `year`, it is that year's topics only: they are refilled into the slots
   * they already occupy, so the relative order of other years is untouched.
   */
  async reorderTopics(ownerId: string, req: TopicReorderRequestDto): Promise<void> {
    const all = await this.topics.find({
      where: { ownerId },
      order: { position: 'ASC', id: 'ASC' },
    });
    const scoped =
      req.year === undefined
        ? all
        : all.filter((t) => (t.year ?? yearInIstanbul(t.createdAt)) === req.year);
    assertExactSet(
      scoped.map((t) => t.id),
      req.orderedIds,
    );
    const globalOrder =
      req.year === undefined
        ? req.orderedIds
        : fillSlots(
            all.map((t) => t.id),
            scoped.map((t) => t.id),
            req.orderedIds,
          );
    await this.writePositions(LearningTopic, planRenumber(all, globalOrder));
  }

  async createSubtopic(
    ownerId: string,
    topicId: string,
    req: SubtopicRequestDto,
  ): Promise<SubtopicResponseDto> {
    await this.requireTopic(ownerId, topicId);
    const subtopic = this.subtopics.create({
      topicId,
      title: req.title,
      description: req.description ?? null,
      position: await this.nextSubtopicPosition(topicId),
    });
    return SubtopicResponseDto.from(await this.subtopics.save(subtopic), []);
  }

  async updateSubtopic(
    ownerId: string,
    id: string,
    req: SubtopicRequestDto,
  ): Promise<SubtopicResponseDto> {
    const subtopic = await this.requireSubtopic(ownerId, id);
    subtopic.title = req.title;
    if (req.description !== undefined) subtopic.description = req.description ?? null;
    return this.toSubtopicDto(await this.subtopics.save(subtopic));
  }

  /** Soft-deletes a subtopic and its items under one deleted_at stamp. */
  async deleteSubtopic(ownerId: string, id: string): Promise<void> {
    const subtopic = await this.requireSubtopic(ownerId, id);
    const items = await this.items.find({ where: { subtopicId: subtopic.id } });
    for (const item of items)
      await this.notifications.cancelForSource(ownerId, 'learning', item.id);
    const at = new Date();
    await this.dataSource.transaction(async (em) => {
      await this.stamp(
        em,
        LearningItem,
        'subtopic_id = :parent AND deleted_at IS NULL',
        subtopic.id,
        at,
      );
      await this.stamp(em, LearningSubtopic, 'id = :parent', subtopic.id, at);
    });
  }

  async restoreSubtopic(ownerId: string, id: string): Promise<SubtopicResponseDto> {
    const subtopic = await this.requireSubtopic(ownerId, id, true);
    const at = this.requireDeletedAt(subtopic.deletedAt, 'Learning subtopic');
    await this.requireTopic(ownerId, subtopic.topicId).catch(rethrowAsParentMissing);
    const position = await this.nextSubtopicPosition(subtopic.topicId);
    await this.dataSource.transaction(async (em) => {
      await this.unstamp(em, LearningSubtopic, 'id = :parent', subtopic.id, at, { position });
      await this.unstamp(
        em,
        LearningItem,
        'subtopic_id = :parent AND deleted_at = :at',
        subtopic.id,
        at,
      );
    });
    const restored = await this.requireSubtopic(ownerId, id);
    await this.resyncTopicNotifications(ownerId, restored.topicId);
    return this.toSubtopicDto(restored);
  }

  async reorderSubtopics(
    ownerId: string,
    topicId: string,
    req: LearningReorderRequestDto,
  ): Promise<void> {
    await this.requireTopic(ownerId, topicId);
    const rows = await this.subtopics.find({
      where: { topicId },
      order: { position: 'ASC', id: 'ASC' },
    });
    assertExactSet(
      rows.map((r) => r.id),
      req.orderedIds,
    );
    await this.writePositions(LearningSubtopic, planRenumber(rows, req.orderedIds));
  }

  async createItem(
    ownerId: string,
    topicId: string,
    req: ItemRequestDto,
  ): Promise<ItemResponseDto> {
    await this.requireTopic(ownerId, topicId);
    if (req.subtopicId) await this.requireSubtopicInTopic(topicId, req.subtopicId);
    const item = this.items.create({
      topicId,
      subtopicId: req.subtopicId ?? null,
      text: req.text,
      url: req.url || null,
      notes: req.notes ?? null,
      estimatedMinutes: req.estimatedMinutes ?? null,
      reviewAt: req.reviewAt ? new Date(req.reviewAt) : null,
      notifyMinutesBefore: req.notifyMinutesBefore ?? null,
      completedAt: null,
      position: req.position ?? (await this.nextItemPosition(topicId, req.subtopicId ?? null)),
    });
    const saved = await this.items.save(item);
    await this.syncNotification(ownerId, saved);
    return ItemResponseDto.from(saved);
  }

  async updateItem(ownerId: string, id: string, req: ItemRequestDto): Promise<ItemResponseDto> {
    const item = await this.requireItem(ownerId, id);
    item.text = req.text;
    if (req.url !== undefined) item.url = req.url || null;
    if (req.notes !== undefined) item.notes = req.notes ?? null;
    if (req.estimatedMinutes !== undefined) item.estimatedMinutes = req.estimatedMinutes ?? null;
    if (req.reviewAt !== undefined) item.reviewAt = req.reviewAt ? new Date(req.reviewAt) : null;
    if (req.notifyMinutesBefore !== undefined)
      item.notifyMinutesBefore = req.notifyMinutesBefore ?? null;
    if (req.position !== undefined) item.position = req.position;
    if (req.subtopicId !== undefined && (req.subtopicId ?? null) !== item.subtopicId) {
      if (req.subtopicId) await this.requireSubtopicInTopic(item.topicId, req.subtopicId);
      item.subtopicId = req.subtopicId ?? null;
      // Changing lists without an explicit position appends to the end of the target list.
      if (req.position === undefined)
        item.position = await this.nextItemPosition(item.topicId, item.subtopicId);
    }
    const saved = await this.items.save(item);
    await this.syncNotification(ownerId, saved);
    return ItemResponseDto.from(saved);
  }

  async toggleItem(ownerId: string, id: string): Promise<ItemResponseDto> {
    const item = await this.requireItem(ownerId, id);
    item.completedAt = item.completedAt ? null : new Date();
    const saved = await this.items.save(item);
    await this.syncNotification(ownerId, saved);
    return ItemResponseDto.from(saved);
  }

  async deleteItem(ownerId: string, id: string): Promise<void> {
    const item = await this.requireItem(ownerId, id);
    await this.notifications.cancelForSource(ownerId, 'learning', item.id);
    await this.items.softRemove(item);
  }

  async restoreItem(ownerId: string, id: string): Promise<ItemResponseDto> {
    const item = await this.requireItem(ownerId, id, true);
    this.requireDeletedAt(item.deletedAt, 'Learning item');
    await this.requireTopic(ownerId, item.topicId).catch(rethrowAsParentMissing);
    if (item.subtopicId) {
      const parent = await this.subtopics.findOne({ where: { id: item.subtopicId } });
      if (!parent) throw ApiException.badRequest('Restore the parent subtopic first');
    }
    const position = await this.nextItemPosition(item.topicId, item.subtopicId);
    await this.dataSource.transaction(async (em) => {
      await em
        .createQueryBuilder()
        .update(LearningItem)
        .set({ deletedAt: null, position })
        .where('id = :id', { id: item.id })
        .execute();
    });
    const restored = await this.requireItem(ownerId, id);
    await this.syncNotification(ownerId, restored);
    return ItemResponseDto.from(restored);
  }

  /** Reorders the direct items of a topic (those without a subtopic). */
  async reorderItems(
    ownerId: string,
    topicId: string,
    req: LearningReorderRequestDto,
  ): Promise<void> {
    await this.requireTopic(ownerId, topicId);
    const rows = await this.itemsInList(topicId, null);
    assertExactSet(
      rows.map((r) => r.id),
      req.orderedIds,
    );
    await this.writePositions(LearningItem, planRenumber(rows, req.orderedIds));
  }

  async reorderSubtopicItems(
    ownerId: string,
    subtopicId: string,
    req: LearningReorderRequestDto,
  ): Promise<void> {
    const subtopic = await this.requireSubtopic(ownerId, subtopicId);
    const rows = await this.itemsInList(subtopic.topicId, subtopic.id);
    assertExactSet(
      rows.map((r) => r.id),
      req.orderedIds,
    );
    await this.writePositions(LearningItem, planRenumber(rows, req.orderedIds));
  }

  /**
   * Moves an item to `index` of the target list (a subtopic of the same topic, or the
   * topic's direct list when `subtopicId` is null) and renumbers every list it touched
   * in one transaction.
   */
  async moveItem(ownerId: string, id: string, req: MoveItemRequestDto): Promise<void> {
    const item = await this.requireItem(ownerId, id);
    const targetSubtopicId = req.subtopicId;
    const sameList = targetSubtopicId === item.subtopicId;
    if (!sameList && targetSubtopicId)
      await this.requireSubtopicInTopic(item.topicId, targetSubtopicId);

    const sourceRows = await this.itemsInList(item.topicId, item.subtopicId);
    if (sameList) {
      const ids = insertAt(
        sourceRows.filter((r) => r.id !== item.id).map((r) => r.id),
        item.id,
        req.index,
      );
      await this.writePositions(LearningItem, planRenumber(sourceRows, ids));
      return;
    }

    const targetRows = await this.itemsInList(item.topicId, targetSubtopicId);
    const targetIds = insertAt(
      targetRows.map((r) => r.id),
      item.id,
      req.index,
    );
    const sourceRest = sourceRows.filter((r) => r.id !== item.id);
    await this.dataSource.transaction(async (em) => {
      await em
        .createQueryBuilder()
        .update(LearningItem)
        .set({ subtopicId: targetSubtopicId, position: targetIds.indexOf(item.id) })
        .where('id = :id', { id: item.id })
        .execute();
      await this.applyPositions(
        em,
        LearningItem,
        planRenumber(
          sourceRest,
          sourceRest.map((r) => r.id),
        ),
      );
      await this.applyPositions(em, LearningItem, planRenumber(targetRows, targetIds));
    });
  }

  private itemsInList(topicId: string, subtopicId: string | null): Promise<LearningItem[]> {
    return this.items.find({
      where: { topicId, subtopicId: subtopicId ?? IsNull() },
      order: { position: 'ASC', id: 'ASC' },
    });
  }

  private writePositions(
    entity: EntityTarget<ObjectLiteral>,
    changes: PositionChange[],
  ): Promise<void> {
    if (!changes.length) return Promise.resolve();
    return this.dataSource.transaction((em) => this.applyPositions(em, entity, changes));
  }

  private async applyPositions(
    em: EntityManager,
    entity: EntityTarget<ObjectLiteral>,
    changes: PositionChange[],
  ): Promise<void> {
    for (const change of changes)
      await em
        .createQueryBuilder()
        .update(entity)
        .set({ position: change.position })
        .where('id = :id', { id: change.id })
        .execute();
  }

  private async syncNotification(ownerId: string, item: LearningItem): Promise<void> {
    await this.notifications.cancelForSource(ownerId, 'learning', item.id);
    if (item.completedAt) return;
    const fireAt = leadTimeFireAt(item.reviewAt, item.notifyMinutesBefore);
    if (!fireAt || !item.reviewAt) return;
    await this.notifications.enqueue({
      ownerId,
      kind: 'learning',
      sourceId: item.id,
      scheduledAt: fireAt,
      title: item.text,
      body: formatLeadTimeBody(item.reviewAt, item.notifyMinutesBefore ?? 0, item.notes),
      deepLink: `/learning?topic=${item.topicId}`,
    });
  }

  private async nextTopicPosition(ownerId: string): Promise<number> {
    const last = await this.topics.findOne({ where: { ownerId }, order: { position: 'DESC' } });
    return last ? last.position + 1 : 0;
  }
  private async nextSubtopicPosition(topicId: string): Promise<number> {
    const last = await this.subtopics.findOne({ where: { topicId }, order: { position: 'DESC' } });
    return last ? last.position + 1 : 0;
  }
  /** Next position at the end of one list: a subtopic's items, or the topic's direct items. */
  private async nextItemPosition(topicId: string, subtopicId: string | null): Promise<number> {
    const last = await this.items.findOne({
      where: { topicId, subtopicId: subtopicId ?? IsNull() },
      order: { position: 'DESC' },
    });
    return last ? last.position + 1 : 0;
  }
  private async requireTopic(ownerId: string, id: string): Promise<LearningTopic> {
    const topic = await this.topics.findOne({ where: { id, ownerId } });
    if (!topic) throw ApiException.notFound('Learning topic not found');
    return topic;
  }
  private async requireSubtopic(
    ownerId: string,
    id: string,
    withDeleted = false,
  ): Promise<LearningSubtopic> {
    const query = this.subtopics
      .createQueryBuilder('s')
      .innerJoin(LearningTopic, 't', 't.id = s.topic_id AND t.owner_id = :ownerId', { ownerId })
      .where('s.id = :id', { id });
    if (withDeleted) query.withDeleted();
    const subtopic = await query.getOne();
    if (!subtopic) throw ApiException.notFound('Learning subtopic not found');
    return subtopic;
  }
  private async requireSubtopicInTopic(
    topicId: string,
    subtopicId: string,
  ): Promise<LearningSubtopic> {
    const subtopic = await this.subtopics.findOne({ where: { id: subtopicId } });
    if (!subtopic) throw ApiException.notFound('Learning subtopic not found');
    if (subtopic.topicId !== topicId)
      throw ApiException.badRequest('Learning subtopic does not belong to topic');
    return subtopic;
  }
  private async requireItem(
    ownerId: string,
    id: string,
    withDeleted = false,
  ): Promise<LearningItem> {
    const query = this.items
      .createQueryBuilder('i')
      .innerJoin(LearningTopic, 't', 't.id = i.topic_id AND t.owner_id = :ownerId', { ownerId })
      .where('i.id = :id', { id });
    if (withDeleted) query.withDeleted();
    const item = await query.getOne();
    if (!item) throw ApiException.notFound('Learning item not found');
    return item;
  }

  private requireDeletedAt(deletedAt: Date | null | undefined, label: string): Date {
    if (!deletedAt) throw ApiException.badRequest(`${label} is not deleted`);
    return deletedAt;
  }

  private async stamp(
    em: EntityManager,
    entity: EntityTarget<ObjectLiteral>,
    where: string,
    parent: string,
    at: Date,
  ): Promise<void> {
    await em
      .createQueryBuilder()
      .update(entity)
      .set({ deletedAt: at })
      .where(where, { parent })
      .execute();
  }

  private async unstamp(
    em: EntityManager,
    entity: EntityTarget<ObjectLiteral>,
    where: string,
    parent: string,
    at: Date,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await em
      .createQueryBuilder()
      .update(entity)
      .set({ deletedAt: null, ...extra })
      .where(where, { parent, at })
      .execute();
  }

  /** Re-queues review notifications for the items of a topic after a restore or an undo. */
  async resyncTopicNotifications(ownerId: string, topicId: string): Promise<void> {
    const items = await this.items.find({ where: { topicId } });
    for (const item of items) await this.syncNotification(ownerId, item);
  }
}
