import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { NoteLinkService } from './note-link.service';
import { NoteLink } from './note-link.entity';
import { NoteService } from '../note/note.service';
import { ItemService } from '../item/item.service';
import { ProjectAccessService } from '../project/project-access.service';
import { GoalService } from '../goal/goal.service';
import { ApiException } from '../common/api.exception';
import { NoteLinkTargetType } from './dto/note-link-dtos';

describe('NoteLinkService', () => {
  let service: NoteLinkService;
  let noteLinkRepo: jest.Mocked<Repository<NoteLink>>;
  let noteService: jest.Mocked<NoteService>;
  let itemService: jest.Mocked<ItemService>;
  let projectAccessService: jest.Mocked<ProjectAccessService>;
  let goalService: jest.Mocked<GoalService>;
  let dataSource: { query: jest.Mock };

  const userId = '100';
  const otherUserId = '200';
  const noteId = '10';
  const linkId = '55';

  beforeEach(async () => {
    noteLinkRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      softRemove: jest.fn(),
    } as unknown as jest.Mocked<Repository<NoteLink>>;

    noteService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<NoteService>;

    itemService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ItemService>;

    projectAccessService = {
      requireAccess: jest.fn(),
    } as unknown as jest.Mocked<ProjectAccessService>;

    goalService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<GoalService>;

    dataSource = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NoteLinkService,
        { provide: getRepositoryToken(NoteLink), useValue: noteLinkRepo },
        { provide: NoteService, useValue: noteService },
        { provide: ItemService, useValue: itemService },
        { provide: ProjectAccessService, useValue: projectAccessService },
        { provide: GoalService, useValue: goalService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<NoteLinkService>(NoteLinkService);
  });

  describe('createLink', () => {
    it('throws 400 on invalid noteId or targetId', async () => {
      await expect(
        service.createLink(userId, 'not-a-number', {
          targetType: NoteLinkTargetType.ITEM,
          targetId: '1',
        }),
      ).rejects.toThrow(ApiException.badRequest('Invalid note id: must be a numeric ID (1-19 digits)'));

      await expect(
        service.createLink(userId, '1', {
          targetType: NoteLinkTargetType.ITEM,
          targetId: '99999999999999999999999', // exceeds bigint max
        }),
      ).rejects.toThrow(ApiException.badRequest('Invalid target id: must be a numeric ID (1-19 digits)'));
    });

    it('throws 404 when note does not belong to caller or does not exist', async () => {
      noteService.get.mockRejectedValue(ApiException.notFound('Note not found'));

      await expect(
        service.createLink(userId, noteId, {
          targetType: NoteLinkTargetType.ITEM,
          targetId: '20',
        }),
      ).rejects.toThrow(ApiException.notFound('Note not found'));

      expect(noteService.get).toHaveBeenCalledWith(userId, noteId);
    });

    it('throws 404 when target item does not exist or caller has no access', async () => {
      noteService.get.mockResolvedValue({ id: noteId, title: 'My Note' } as any);
      itemService.get.mockRejectedValue(ApiException.notFound('Item not found'));

      await expect(
        service.createLink(userId, noteId, {
          targetType: NoteLinkTargetType.ITEM,
          targetId: '999',
        }),
      ).rejects.toThrow(ApiException.notFound('Item not found'));
    });

    it('throws 404 when target project is inaccessible or does not exist', async () => {
      noteService.get.mockResolvedValue({ id: noteId, title: 'My Note' } as any);
      projectAccessService.requireAccess.mockRejectedValue(
        ApiException.notFound('Project not found'),
      );

      await expect(
        service.createLink(userId, noteId, {
          targetType: NoteLinkTargetType.PROJECT,
          targetId: '888',
        }),
      ).rejects.toThrow(ApiException.notFound('Project not found'));
    });

    it('throws 403 when user is project member but lacks required role', async () => {
      noteService.get.mockResolvedValue({ id: noteId, title: 'My Note' } as any);
      projectAccessService.requireAccess.mockRejectedValue(
        ApiException.forbidden('You do not have permission to do this in this project'),
      );

      await expect(
        service.createLink(userId, noteId, {
          targetType: NoteLinkTargetType.PROJECT,
          targetId: '888',
        }),
      ).rejects.toThrow(ApiException.forbidden('You do not have permission to do this in this project'));
    });

    it('throws 404 when target goal does not exist, is deleted, or belongs to another user', async () => {
      noteService.get.mockResolvedValue({ id: noteId, title: 'My Note' } as any);
      goalService.get.mockRejectedValue(ApiException.notFound('Goal not found'));

      await expect(
        service.createLink(userId, noteId, {
          targetType: NoteLinkTargetType.GOAL,
          targetId: '777',
        }),
      ).rejects.toThrow(ApiException.notFound('Goal not found'));
    });

    it('returns existing link idempotently without saving duplicate', async () => {
      noteService.get.mockResolvedValue({ id: noteId, title: 'My Note' } as any);
      itemService.get.mockResolvedValue({ id: '20', title: 'Task item' } as any);

      const existingLink = {
        id: '1',
        ownerId: userId,
        noteId,
        targetType: 'item' as const,
        targetId: '20',
        createdAt: new Date('2026-10-10'),
      };
      noteLinkRepo.findOne.mockResolvedValue(existingLink as any);

      const res = await service.createLink(userId, noteId, {
        targetType: NoteLinkTargetType.ITEM,
        targetId: '20',
      });

      expect(res.id).toBe('1');
      expect(res.targetTitle).toBe('Task item');
      expect(noteLinkRepo.save).not.toHaveBeenCalled();
    });

    it('throws 400 when note already has 50 live links', async () => {
      noteService.get.mockResolvedValue({ id: noteId, title: 'My Note' } as any);
      itemService.get.mockResolvedValue({ id: '20', title: 'Task item' } as any);
      noteLinkRepo.findOne.mockResolvedValue(null);
      noteLinkRepo.count.mockResolvedValue(50);

      await expect(
        service.createLink(userId, noteId, {
          targetType: NoteLinkTargetType.ITEM,
          targetId: '20',
        }),
      ).rejects.toThrow(ApiException.badRequest('A note can have at most 50 links'));
    });

    it('successfully links an item and returns targetTitle', async () => {
      noteService.get.mockResolvedValue({ id: noteId, title: 'My Note' } as any);
      itemService.get.mockResolvedValue({ id: '20', title: 'Write tests' } as any);
      noteLinkRepo.findOne.mockResolvedValue(null);
      noteLinkRepo.count.mockResolvedValue(2);

      const newEntity = {
        id: '101',
        ownerId: userId,
        noteId,
        targetType: 'item' as const,
        targetId: '20',
        createdAt: new Date('2026-10-13'),
      };
      noteLinkRepo.create.mockReturnValue(newEntity as any);
      noteLinkRepo.save.mockResolvedValue(newEntity as any);

      const res = await service.createLink(userId, noteId, {
        targetType: NoteLinkTargetType.ITEM,
        targetId: '20',
      });

      expect(res).toEqual({
        id: '101',
        noteId,
        targetType: NoteLinkTargetType.ITEM,
        targetId: '20',
        targetTitle: 'Write tests',
        createdAt: newEntity.createdAt,
      });
      expect(noteLinkRepo.save).toHaveBeenCalled();
    });

    it('successfully links a project and resolves targetTitle from project.name', async () => {
      noteService.get.mockResolvedValue({ id: noteId, title: 'My Note' } as any);
      projectAccessService.requireAccess.mockResolvedValue({
        project: { id: '30', name: 'Husrevity Redesign' } as any,
        role: 'EDITOR',
      });
      noteLinkRepo.findOne.mockResolvedValue(null);
      noteLinkRepo.count.mockResolvedValue(0);

      const newEntity = {
        id: '102',
        ownerId: userId,
        noteId,
        targetType: 'project' as const,
        targetId: '30',
        createdAt: new Date('2026-10-13'),
      };
      noteLinkRepo.create.mockReturnValue(newEntity as any);
      noteLinkRepo.save.mockResolvedValue(newEntity as any);

      const res = await service.createLink(userId, noteId, {
        targetType: NoteLinkTargetType.PROJECT,
        targetId: '30',
      });

      expect(res.targetTitle).toBe('Husrevity Redesign');
    });

    it('successfully links a goal and resolves targetTitle from goal.title', async () => {
      noteService.get.mockResolvedValue({ id: noteId, title: 'My Note' } as any);
      goalService.get.mockResolvedValue({ id: '40', title: 'Ship Phase 2' } as any);
      noteLinkRepo.findOne.mockResolvedValue(null);
      noteLinkRepo.count.mockResolvedValue(0);

      const newEntity = {
        id: '103',
        ownerId: userId,
        noteId,
        targetType: 'goal' as const,
        targetId: '40',
        createdAt: new Date('2026-10-13'),
      };
      noteLinkRepo.create.mockReturnValue(newEntity as any);
      noteLinkRepo.save.mockResolvedValue(newEntity as any);

      const res = await service.createLink(userId, noteId, {
        targetType: NoteLinkTargetType.GOAL,
        targetId: '40',
      });

      expect(res.targetTitle).toBe('Ship Phase 2');
    });
  });

  describe('getLinksForNote', () => {
    it('throws 400 on invalid noteId', async () => {
      await expect(service.getLinksForNote(userId, 'abc')).rejects.toThrow(
        ApiException.badRequest('Invalid note id: must be a numeric ID (1-19 digits)'),
      );
    });

    it('throws 404 when note does not belong to caller or is not found', async () => {
      noteService.get.mockRejectedValue(ApiException.notFound('Note not found'));

      await expect(service.getLinksForNote(userId, noteId)).rejects.toThrow(
        ApiException.notFound('Note not found'),
      );
    });

    it('resolves target titles in bounded queries (no N+1 per link)', async () => {
      noteService.get.mockResolvedValue({ id: noteId, title: 'My Note' } as any);

      const links = [
        { id: '1', ownerId: userId, noteId, targetType: 'item' as const, targetId: '101', createdAt: new Date() },
        { id: '2', ownerId: userId, noteId, targetType: 'item' as const, targetId: '102', createdAt: new Date() },
        { id: '3', ownerId: userId, noteId, targetType: 'project' as const, targetId: '201', createdAt: new Date() },
        { id: '4', ownerId: userId, noteId, targetType: 'goal' as const, targetId: '301', createdAt: new Date() },
      ];
      noteLinkRepo.find.mockResolvedValue(links as any);

      // Single bounded query executed on dataSource for batch title resolution
      dataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM items')) {
          return [
            { id: '101', title: 'Item 1' },
            { id: '102', title: 'Item 2' },
          ];
        }
        if (sql.includes('FROM project')) {
          return [{ id: '201', title: 'Project 1' }];
        }
        if (sql.includes('FROM goal')) {
          return [{ id: '301', title: 'Goal 1' }];
        }
        return [];
      });

      const res = await service.getLinksForNote(userId, noteId);

      expect(res).toHaveLength(4);
      expect(res[0].targetTitle).toBe('Item 1');
      expect(res[1].targetTitle).toBe('Item 2');
      expect(res[2].targetTitle).toBe('Project 1');
      expect(res[3].targetTitle).toBe('Goal 1');

      // dataSource.query called at most 3 times (1 for items, 1 for projects, 1 for goals)
      expect(dataSource.query.mock.calls.length).toBeLessThanOrEqual(3);
    });

    it('sets targetTitle to null if a target was deleted or is inaccessible', async () => {
      noteService.get.mockResolvedValue({ id: noteId, title: 'My Note' } as any);

      const links = [
        { id: '1', ownerId: userId, noteId, targetType: 'item' as const, targetId: '999', createdAt: new Date() },
      ];
      noteLinkRepo.find.mockResolvedValue(links as any);
      dataSource.query.mockResolvedValue([]); // item not found or deleted

      const res = await service.getLinksForNote(userId, noteId);

      expect(res).toHaveLength(1);
      expect(res[0].targetTitle).toBeNull();
    });
  });

  describe('deleteLink', () => {
    it('throws 400 on invalid noteId or linkId', async () => {
      await expect(service.deleteLink(userId, 'bad', '1')).rejects.toThrow(
        ApiException.badRequest('Invalid note id: must be a numeric ID (1-19 digits)'),
      );
      await expect(service.deleteLink(userId, '1', 'bad')).rejects.toThrow(
        ApiException.badRequest('Invalid link id: must be a numeric ID (1-19 digits)'),
      );
    });

    it('throws 404 when note does not belong to caller', async () => {
      noteService.get.mockRejectedValue(ApiException.notFound('Note not found'));

      await expect(service.deleteLink(userId, noteId, linkId)).rejects.toThrow(
        ApiException.notFound('Note not found'),
      );
    });

    it('throws 404 when link does not exist, belongs to another note, or belongs to another user', async () => {
      noteService.get.mockResolvedValue({ id: noteId, title: 'My Note' } as any);
      noteLinkRepo.findOne.mockResolvedValue(null);

      await expect(service.deleteLink(userId, noteId, linkId)).rejects.toThrow(
        ApiException.notFound('Note link not found'),
      );
      expect(noteLinkRepo.findOne).toHaveBeenCalledWith({
        where: { id: linkId, noteId, ownerId: userId },
      });
    });

    it('soft-deletes the link when owned by caller', async () => {
      noteService.get.mockResolvedValue({ id: noteId, title: 'My Note' } as any);
      const existingLink = {
        id: linkId,
        ownerId: userId,
        noteId,
        targetType: 'item' as const,
        targetId: '10',
      };
      noteLinkRepo.findOne.mockResolvedValue(existingLink as any);

      await service.deleteLink(userId, noteId, linkId);

      expect(noteLinkRepo.softRemove).toHaveBeenCalledWith(existingLink);
    });
  });

  describe('listNotesForTarget', () => {
    it('throws 400 on invalid targetId', async () => {
      await expect(
        service.listNotesForTarget(userId, {
          targetType: NoteLinkTargetType.ITEM,
          targetId: 'invalid',
        }),
      ).rejects.toThrow(ApiException.badRequest('Invalid target id: must be a numeric ID (1-19 digits)'));
    });

    it('throws 404/403 when target is inaccessible or not found', async () => {
      itemService.get.mockRejectedValue(ApiException.notFound('Item not found'));
      await expect(
        service.listNotesForTarget(userId, {
          targetType: NoteLinkTargetType.ITEM,
          targetId: '10',
        }),
      ).rejects.toThrow(ApiException.notFound('Item not found'));

      projectAccessService.requireAccess.mockRejectedValue(
        ApiException.notFound('Project not found'),
      );
      await expect(
        service.listNotesForTarget(userId, {
          targetType: NoteLinkTargetType.PROJECT,
          targetId: '20',
        }),
      ).rejects.toThrow(ApiException.notFound('Project not found'));

      goalService.get.mockRejectedValue(ApiException.notFound('Goal not found'));
      await expect(
        service.listNotesForTarget(userId, {
          targetType: NoteLinkTargetType.GOAL,
          targetId: '30',
        }),
      ).rejects.toThrow(ApiException.notFound('Goal not found'));
    });

    it('returns caller notes linked to target, filtered by live notes and capped at 100', async () => {
      itemService.get.mockResolvedValue({ id: '10', title: 'Task' } as any);

      const rows = [
        { id: '1', title: 'Note 1', updatedAt: new Date('2026-10-12') },
        { id: '2', title: 'Note 2', updatedAt: new Date('2026-10-11') },
      ];
      dataSource.query.mockResolvedValue(rows);

      const res = await service.listNotesForTarget(userId, {
        targetType: NoteLinkTargetType.ITEM,
        targetId: '10',
      });

      expect(res).toEqual([
        { id: '1', title: 'Note 1', updatedAt: rows[0].updatedAt },
        { id: '2', title: 'Note 2', updatedAt: rows[1].updatedAt },
      ]);

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('note_link');
      expect(sql).toContain('note');
      expect(sql).toContain('LIMIT 100');
      expect(params).toContain(userId);
      expect(params).toContain('item');
      expect(params).toContain('10');
    });
  });

  describe('review fixes: removed members and concurrent POSTs', () => {
    it('title queries ignore soft-deleted project_member rows (a removed member must not read titles)', async () => {
      noteService.get.mockResolvedValue({ id: noteId, title: 'My Note' } as any);
      noteLinkRepo.find.mockResolvedValue([
        { id: '1', ownerId: userId, noteId, targetType: 'item', targetId: '101', createdAt: new Date() },
        { id: '2', ownerId: userId, noteId, targetType: 'project', targetId: '201', createdAt: new Date() },
      ] as any);
      dataSource.query.mockResolvedValue([]);

      await service.getLinksForNote(userId, noteId);

      const sqls = dataSource.query.mock.calls.map((c: unknown[]) => String(c[0]));
      const joinsMembers = sqls.filter((q) => q.includes('project_member'));
      expect(joinsMembers.length).toBe(2);
      for (const q of joinsMembers) {
        expect(q.replace(/\s+/g, ' ')).toContain('pm.deleted_at IS NULL');
      }
    });

    it('a unique violation from a concurrent identical POST returns the existing link instead of a 500', async () => {
      noteService.get.mockResolvedValue({ id: noteId, title: 'My Note' } as any);
      itemService.get.mockResolvedValue({ id: '20', title: 'Task item' } as any);
      const winner = {
        id: '7',
        ownerId: userId,
        noteId,
        targetType: 'item' as const,
        targetId: '20',
        createdAt: new Date('2026-10-10'),
      };
      // first lookup: nothing yet; after the losing INSERT the winner is visible
      noteLinkRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(winner as any);
      noteLinkRepo.count.mockResolvedValue(3);
      noteLinkRepo.create.mockImplementation((v: any) => v);
      noteLinkRepo.save.mockRejectedValue(
        Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' }),
      );

      const res = await service.createLink(userId, noteId, {
        targetType: NoteLinkTargetType.ITEM,
        targetId: '20',
      });

      expect(res.id).toBe('7');
      expect(res.targetTitle).toBe('Task item');
    });

    it('rethrows other persistence errors unchanged', async () => {
      noteService.get.mockResolvedValue({ id: noteId, title: 'My Note' } as any);
      itemService.get.mockResolvedValue({ id: '20', title: 'Task item' } as any);
      noteLinkRepo.findOne.mockResolvedValue(null);
      noteLinkRepo.count.mockResolvedValue(0);
      noteLinkRepo.create.mockImplementation((v: any) => v);
      noteLinkRepo.save.mockRejectedValue(Object.assign(new Error('connection reset'), { code: '08006' }));

      await expect(
        service.createLink(userId, noteId, { targetType: NoteLinkTargetType.ITEM, targetId: '20' }),
      ).rejects.toThrow('connection reset');
    });
  });
});
