import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NoteService } from './note.service';
import { Note } from './note.entity';
import { NoteTag } from './note-tag.entity';
import { ApiException } from '../common/api.exception';

describe('NoteService', () => {
  const ownerId = '1';
  const UPDATED_AT = new Date('2026-01-01T00:00:00.000Z');
  let service: NoteService;
  let notes: { findOne: jest.Mock; save: jest.Mock; softRemove: jest.Mock };
  let tags: { findOne: jest.Mock; softRemove: jest.Mock; remove: jest.Mock };
  let em: { getRepository: jest.Mock; query: jest.Mock };

  beforeEach(async () => {
    notes = {
      findOne: jest.fn(),
      save: jest.fn((v) => Promise.resolve(v)),
      softRemove: jest.fn((v) => Promise.resolve(v)),
    };
    tags = {
      findOne: jest.fn(),
      softRemove: jest.fn((v) => Promise.resolve(v)),
      remove: jest.fn(),
    };
    em = { getRepository: jest.fn(() => tags), query: jest.fn().mockResolvedValue([]) };
    const dataSource = { transaction: jest.fn((cb: (m: typeof em) => unknown) => cb(em)) };
    const module = await Test.createTestingModule({
      providers: [
        NoteService,
        { provide: getRepositoryToken(Note), useValue: notes },
        { provide: getRepositoryToken(NoteTag), useValue: tags },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(NoteService);
  });

  describe('If-Match', () => {
    const row = () =>
      ({
        id: '9',
        ownerId,
        title: 'Old',
        bodyMarkdown: null,
        pinned: false,
        archived: false,
        colorHex: null,
        tags: [],
        createdAt: UPDATED_AT,
        updatedAt: UPDATED_AT,
      }) as unknown as Note;

    it('update throws 409 and saves nothing when ifMatchMs is stale', async () => {
      notes.findOne.mockResolvedValueOnce(row());

      await expect(
        service.update(ownerId, '9', { title: 'New' }, UPDATED_AT.getTime() - 1),
      ).rejects.toMatchObject({ status: 409 });
      expect(notes.save).not.toHaveBeenCalled();
    });

    it('update applies when ifMatchMs equals updatedAt, or is omitted', async () => {
      notes.findOne.mockResolvedValue(row());

      await service.update(ownerId, '9', { title: 'New' }, UPDATED_AT.getTime());
      await service.update(ownerId, '9', { title: 'Newer' });

      expect(notes.save).toHaveBeenCalledTimes(2);
    });

    it('delete throws 409 and removes nothing when ifMatchMs is stale', async () => {
      notes.findOne.mockResolvedValueOnce(row());

      await expect(service.delete(ownerId, '9', UPDATED_AT.getTime() - 1)).rejects.toMatchObject({
        status: 409,
      });
      expect(notes.softRemove).not.toHaveBeenCalled();
    });

    it('delete proceeds when ifMatchMs equals updatedAt', async () => {
      notes.findOne.mockResolvedValueOnce(row());

      await service.delete(ownerId, '9', UPDATED_AT.getTime());

      expect(notes.softRemove).toHaveBeenCalled();
    });
  });

  describe('deleteTag', () => {
    it('soft-removes the tag so sync clients receive a tombstone', async () => {
      const row = { id: '5', ownerId, name: 'idea', color: null };
      tags.findOne.mockResolvedValueOnce(row);

      await service.deleteTag(ownerId, '5');

      expect(tags.softRemove).toHaveBeenCalledWith(row);
      expect(tags.remove).not.toHaveBeenCalled();
    });

    it('touches the notes that carried the tag, in the same transaction, so sync re-sends them', async () => {
      tags.findOne.mockResolvedValueOnce({ id: '5', ownerId, name: 'idea', color: null });

      await service.deleteTag(ownerId, '5');

      expect(em.query).toHaveBeenCalledTimes(1);
      const [sql, params] = em.query.mock.calls[0];
      expect(sql).toMatch(/UPDATE note SET updated_at/);
      expect(sql).toMatch(/note_tag_assignment/);
      expect(params).toEqual([ownerId, '5']);
    });

    it("throws 404 and removes nothing when the tag is not the owner's", async () => {
      tags.findOne.mockResolvedValueOnce(null);

      await expect(service.deleteTag(ownerId, '5')).rejects.toThrow(ApiException);
      expect(tags.softRemove).not.toHaveBeenCalled();
      expect(tags.remove).not.toHaveBeenCalled();
      expect(em.query).not.toHaveBeenCalled();
    });
  });
});
