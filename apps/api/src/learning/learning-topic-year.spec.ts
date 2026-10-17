import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { LearningService } from './learning.service';
import { TopicRequestDto, TopicResponseDto, yearInIstanbul } from './dto/learning-dtos';

/**
 * A learning topic carries an explicit, editable `year`. The column is
 * nullable; the response always resolves it, falling back to the year of
 * `createdAt` in Europe/Istanbul so a topic created late on 31 December UTC
 * lands in the year the owner actually saw.
 */
describe('learning topic year', () => {
  const ownerId = '1';
  const midYear = new Date('2026-06-15T12:00:00Z');

  const topic = (over: Record<string, unknown> = {}) =>
    ({
      id: 't1',
      ownerId,
      title: 'Rust',
      description: null,
      position: 0,
      year: null,
      createdAt: midYear,
      updatedAt: midYear,
      ...over,
    }) as never;

  describe('yearInIstanbul', () => {
    it('returns the calendar year in Europe/Istanbul for a mid-year instant', () => {
      expect(yearInIstanbul(midYear)).toBe(2026);
    });

    it('rolls into the next year when UTC is still on 31 December but Istanbul is past midnight', () => {
      expect(yearInIstanbul(new Date('2025-12-31T22:30:00Z'))).toBe(2026);
    });

    it('stays in the old year while Istanbul is still before midnight', () => {
      expect(yearInIstanbul(new Date('2025-12-31T20:30:00Z'))).toBe(2025);
    });

    it('accepts an ISO string as well as a Date', () => {
      expect(yearInIstanbul('2025-12-31T22:30:00Z')).toBe(2026);
    });
  });

  describe('TopicResponseDto.from', () => {
    it('returns the stored year when the column is set', () => {
      const dto = TopicResponseDto.from(topic({ year: 2024 }), [], []);
      expect(dto.year).toBe(2024);
    });

    it('falls back to the Istanbul year of createdAt when the column is null', () => {
      const dto = TopicResponseDto.from(topic({ year: null }), [], []);
      expect(dto.year).toBe(2026);
    });

    it('resolves the fallback in Europe/Istanbul, not UTC', () => {
      const createdAt = new Date('2025-12-31T22:30:00Z');
      const dto = TopicResponseDto.from(
        topic({ year: null, createdAt, updatedAt: createdAt }),
        [],
        [],
      );
      expect(dto.year).toBe(2026);
    });
  });

  describe('LearningService', () => {
    let topics: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
    let subtopics: { find: jest.Mock };
    let items: { find: jest.Mock };
    let service: LearningService;

    beforeEach(() => {
      topics = {
        findOne: jest.fn(),
        create: jest.fn((input: Record<string, unknown>) => input),
        save: jest.fn(async (entity: Record<string, unknown>) => ({
          id: 't1',
          createdAt: midYear,
          updatedAt: midYear,
          ...entity,
        })),
      };
      subtopics = { find: jest.fn().mockResolvedValue([]) };
      items = { find: jest.fn().mockResolvedValue([]) };
      service = new LearningService(
        topics as never,
        subtopics as never,
        items as never,
        {} as never,
        {} as never,
      );
    });

    describe('createTopic', () => {
      it('stores the given year', async () => {
        topics.findOne.mockResolvedValueOnce(null);

        const result = await service.createTopic(ownerId, { title: 'Rust', year: 2025 });

        expect(topics.create).toHaveBeenCalledWith(expect.objectContaining({ year: 2025 }));
        expect(result.year).toBe(2025);
      });

      it('stores null when year is omitted and the response derives it from createdAt', async () => {
        topics.findOne.mockResolvedValueOnce(null);

        const result = await service.createTopic(ownerId, { title: 'Rust' });

        expect(topics.create).toHaveBeenCalledWith(expect.objectContaining({ year: null }));
        expect(result.year).toBe(2026);
      });
    });

    describe('updateTopic', () => {
      it('leaves the stored year untouched when the request omits it', async () => {
        topics.findOne.mockResolvedValueOnce(topic({ year: 2024 }));

        const result = await service.updateTopic(ownerId, 't1', { title: 'Rust 2' });

        expect(topics.save).toHaveBeenCalledWith(expect.objectContaining({ year: 2024 }));
        expect(result.year).toBe(2024);
      });

      it('overrides the stored year when the request gives one', async () => {
        topics.findOne.mockResolvedValueOnce(topic({ year: 2024 }));

        const result = await service.updateTopic(ownerId, 't1', { title: 'Rust', year: 2023 });

        expect(topics.save).toHaveBeenCalledWith(expect.objectContaining({ year: 2023 }));
        expect(result.year).toBe(2023);
      });

      it('clears the stored year back to the derived one when the request sends null', async () => {
        topics.findOne.mockResolvedValueOnce(topic({ year: 2024 }));

        const result = await service.updateTopic(ownerId, 't1', { title: 'Rust', year: null });

        expect(topics.save).toHaveBeenCalledWith(expect.objectContaining({ year: null }));
        expect(result.year).toBe(2026);
      });
    });
  });

  describe('TopicRequestDto validation', () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const meta = { type: 'body' as const, metatype: TopicRequestDto };

    it.each([1999, 2101, 1.5, '2025'])('rejects year %p', async (year) => {
      await expect(pipe.transform({ title: 'Rust', year }, meta)).rejects.toBeDefined();
    });

    it('accepts and keeps a valid year', async () => {
      const res = await pipe.transform({ title: 'Rust', year: 2025 }, meta);
      expect(res.year).toBe(2025);
    });

    it('accepts null (clear) and keeps it', async () => {
      const res = await pipe.transform({ title: 'Rust', year: null }, meta);
      expect(res.year).toBeNull();
    });

    it('accepts an omitted year and leaves it undefined', async () => {
      const res = await pipe.transform({ title: 'Rust' }, meta);
      expect(res.year).toBeUndefined();
    });
  });
});
