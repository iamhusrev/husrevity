import { Test } from '@nestjs/testing';
import { NoteLinkController } from './note-link.controller';
import { NoteLinkService } from './note-link.service';
import {
  CreateNoteLinkDto,
  LinkedNoteDto,
  NoteLinkQueryDto,
  NoteLinkResponseDto,
  NoteLinkTargetType,
} from './dto/note-link-dtos';
import { AuthenticatedUser } from '../common/current-user.decorator';
import { ApiException } from '../common/api.exception';
import { NumericIdPipe } from '../common/numeric-id.pipe';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

describe('NoteLinkController (Contract)', () => {
  let controller: NoteLinkController;
  let service: {
    getLinksForNote: jest.Mock;
    createLink: jest.Mock;
    deleteLink: jest.Mock;
    listNotesForTarget: jest.Mock;
  };

  const user: AuthenticatedUser = {
    userId: '1',
    email: 'test@example.com',
    role: 'ROLE_USER',
  };

  const sampleLink: NoteLinkResponseDto = {
    id: '50',
    noteId: '10',
    targetType: NoteLinkTargetType.ITEM,
    targetId: '100',
    targetTitle: 'Sample Task',
    createdAt: new Date('2026-10-13T10:00:00.000Z'),
  };

  const sampleNote: LinkedNoteDto = {
    id: '10',
    title: 'Sample Note',
    updatedAt: new Date('2026-10-13T10:00:00.000Z'),
  };

  beforeEach(async () => {
    service = {
      getLinksForNote: jest.fn().mockResolvedValue([sampleLink]),
      createLink: jest.fn().mockResolvedValue(sampleLink),
      deleteLink: jest.fn().mockResolvedValue(undefined),
      listNotesForTarget: jest.fn().mockResolvedValue([sampleNote]),
    };

    const module = await Test.createTestingModule({
      controllers: [NoteLinkController],
      providers: [{ provide: NoteLinkService, useValue: service }],
    }).compile();

    controller = module.get(NoteLinkController);
  });

  describe('GET /notes/:id/links', () => {
    it('returns array of note links with targetTitle', async () => {
      const res = await controller.getLinks(user, '10');
      expect(res).toEqual([sampleLink]);
      expect(service.getLinksForNote).toHaveBeenCalledWith('1', '10');
    });

    it('rejects id exceeding int64 max with 400', async () => {
      const hugeId = '9223372036854775808';
      await expect(controller.getLinks(user, hugeId)).rejects.toThrow(ApiException);
      try {
        await controller.getLinks(user, hugeId);
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
      }
    });

    it('propagates 404 when note is not found or foreign', async () => {
      service.getLinksForNote.mockRejectedValue(ApiException.notFound('Note not found'));
      await expect(controller.getLinks(user, '999')).rejects.toThrow(ApiException);
    });
  });

  describe('POST /notes/:id/links', () => {
    it('creates link and returns 201 shape', async () => {
      const body: CreateNoteLinkDto = {
        targetType: NoteLinkTargetType.ITEM,
        targetId: '100',
      };
      const res = await controller.createLink(user, '10', body);
      expect(res).toEqual(sampleLink);
      expect(service.createLink).toHaveBeenCalledWith('1', '10', body);
    });

    it('rejects note id exceeding int64 max with 400', async () => {
      const hugeId = '9223372036854775808';
      const body: CreateNoteLinkDto = {
        targetType: NoteLinkTargetType.ITEM,
        targetId: '100',
      };
      await expect(controller.createLink(user, hugeId, body)).rejects.toThrow(ApiException);
      try {
        await controller.createLink(user, hugeId, body);
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
      }
    });

    it('propagates 404 when note or target is foreign', async () => {
      service.createLink.mockRejectedValue(ApiException.notFound('Item not found'));
      const body: CreateNoteLinkDto = {
        targetType: NoteLinkTargetType.ITEM,
        targetId: '999',
      };
      await expect(controller.createLink(user, '10', body)).rejects.toThrow(ApiException);
    });
  });

  describe('DELETE /notes/:id/links/:linkId', () => {
    it('deletes link and returns void (204)', async () => {
      await controller.removeLink(user, '10', '50');
      expect(service.deleteLink).toHaveBeenCalledWith('1', '10', '50');
    });

    it('rejects invalid note id or link id with 400', async () => {
      const hugeId = '9223372036854775808';
      await expect(controller.removeLink(user, hugeId, '50')).rejects.toThrow(ApiException);
      await expect(controller.removeLink(user, '10', hugeId)).rejects.toThrow(ApiException);
      try {
        await controller.removeLink(user, hugeId, '50');
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
      }
    });

    it('propagates 404 when note or link is not found', async () => {
      service.deleteLink.mockRejectedValue(ApiException.notFound('Note link not found'));
      await expect(controller.removeLink(user, '10', '999')).rejects.toThrow(ApiException);
    });
  });

  describe('GET /note-links', () => {
    it('returns array of linked notes for target', async () => {
      const query: NoteLinkQueryDto = {
        targetType: NoteLinkTargetType.ITEM,
        targetId: '100',
      };
      const res = await controller.listForTarget(user, query);
      expect(res).toEqual([sampleNote]);
      expect(service.listNotesForTarget).toHaveBeenCalledWith('1', query);
    });

    it('rejects invalid target id with 400', async () => {
      const hugeId = '9223372036854775808';
      const query: NoteLinkQueryDto = {
        targetType: NoteLinkTargetType.ITEM,
        targetId: hugeId,
      };
      await expect(controller.listForTarget(user, query)).rejects.toThrow(ApiException);
      try {
        await controller.listForTarget(user, query);
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
      }
    });

    it('propagates 404 when target is not found or inaccessible', async () => {
      service.listNotesForTarget.mockRejectedValue(ApiException.notFound('Item not found'));
      const query: NoteLinkQueryDto = {
        targetType: NoteLinkTargetType.ITEM,
        targetId: '999',
      };
      await expect(controller.listForTarget(user, query)).rejects.toThrow(ApiException);
    });
  });

  describe('DTO validation (Contract)', () => {
    it('validates CreateNoteLinkDto: rejects invalid targetType enum', async () => {
      const dto = plainToInstance(CreateNoteLinkDto, {
        targetType: 'invalid_type',
        targetId: '100',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'targetType')).toBe(true);
    });

    it('validates CreateNoteLinkDto: rejects non-numeric or huge targetId', async () => {
      const nonNumeric = plainToInstance(CreateNoteLinkDto, {
        targetType: NoteLinkTargetType.ITEM,
        targetId: 'abc',
      });
      const nonNumericErrors = await validate(nonNumeric);
      expect(nonNumericErrors.some((e) => e.property === 'targetId')).toBe(true);

      const huge = plainToInstance(CreateNoteLinkDto, {
        targetType: NoteLinkTargetType.ITEM,
        targetId: '9223372036854775808',
      });
      const hugeErrors = await validate(huge);
      expect(hugeErrors.some((e) => e.property === 'targetId')).toBe(true);
    });

    it('validates CreateNoteLinkDto: accepts valid input', async () => {
      const valid = plainToInstance(CreateNoteLinkDto, {
        targetType: NoteLinkTargetType.PROJECT,
        targetId: '12345',
      });
      const errors = await validate(valid);
      expect(errors.length).toBe(0);
    });

    it('validates NoteLinkQueryDto: rejects invalid targetType or targetId', async () => {
      const invalid = plainToInstance(NoteLinkQueryDto, {
        targetType: 'foo',
        targetId: 'xyz',
      });
      const errors = await validate(invalid);
      expect(errors.length).toBe(2);

      const valid = plainToInstance(NoteLinkQueryDto, {
        targetType: NoteLinkTargetType.GOAL,
        targetId: '42',
      });
      const validErrors = await validate(valid);
      expect(validErrors.length).toBe(0);
    });

    it('validates NumericIdPipe transforms valid numeric ids and rejects non-numeric', () => {
      const pipe = new NumericIdPipe();
      expect(pipe.transform('123')).toBe('123');
      expect(() => pipe.transform('abc')).toThrow(ApiException.badRequest('Invalid id'));
    });
  });
});
