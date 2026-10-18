import { Not } from 'typeorm';
import { SportProgram } from './entities/sport-program.entity';
import { SportProgramService } from './sport-program.service';

type MockRepo = {
  find: jest.Mock;
  findOne: jest.Mock;
  count: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  update: jest.Mock;
};

describe('SportProgramService (single active program)', () => {
  const ownerId = '1';
  let programs: MockRepo;
  let sessions: { find: jest.Mock };
  let em: { getRepository: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let service: SportProgramService;

  const program = (over: Partial<SportProgram>): SportProgram =>
    ({
      id: 'p1',
      ownerId,
      name: 'Base',
      description: null,
      weekCount: 4,
      programType: 'WEEKLY',
      aiGenerated: false,
      startDate: '2026-10-01',
      endDate: null,
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...over,
    }) as SportProgram;

  beforeEach(() => {
    programs = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((v) => ({ id: 'new', ...v })),
      save: jest.fn((v) => Promise.resolve({ ...v })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    sessions = { find: jest.fn().mockResolvedValue([]) };
    // Mimics DataSource#transaction: runs the callback with an EntityManager
    // stand-in whose getRepository() returns the same mock as the injected repo.
    em = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === SportProgram) return programs;
        throw new Error(`unexpected entity in transaction: ${String(entity)}`);
      }),
    };
    dataSource = { transaction: jest.fn((cb: (em: unknown) => Promise<unknown>) => cb(em)) };
    service = new SportProgramService(programs as never, sessions as never, dataSource as never);
  });

  describe('activateProgram', () => {
    it("deactivates the owner's other programs in the same transaction when activating", async () => {
      const target = program({ id: 'p2', isActive: false });
      programs.findOne.mockResolvedValueOnce(target);

      const result = await service.activateProgram(ownerId, 'p2', true);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(em.getRepository).toHaveBeenCalledWith(SportProgram);
      expect(programs.update).toHaveBeenCalledWith(
        { ownerId, isActive: true, id: Not('p2') },
        { isActive: false },
      );
      expect(programs.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p2', isActive: true }),
      );
      expect(result.isActive).toBe(true);
    });

    it('just deactivates when isActive is false (does not touch other programs)', async () => {
      programs.findOne.mockResolvedValueOnce(program({ id: 'p2', isActive: true }));

      const result = await service.activateProgram(ownerId, 'p2', false);

      expect(programs.update).not.toHaveBeenCalled();
      expect(programs.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p2', isActive: false }),
      );
      expect(result.isActive).toBe(false);
    });
  });

  describe('createProgram', () => {
    const req = {
      name: 'New',
      weekCount: 8,
      programType: 'WEEKLY' as const,
      startDate: '2026-10-12',
    };

    it('starts active when the owner has no active program', async () => {
      programs.count.mockResolvedValueOnce(0);

      const result = await service.createProgram(ownerId, req);

      expect(programs.count).toHaveBeenCalledWith({ where: { ownerId, isActive: true } });
      expect(programs.create).toHaveBeenCalledWith(expect.objectContaining({ isActive: true }));
      expect(result.isActive).toBe(true);
    });

    it('starts inactive when the owner already has an active program', async () => {
      programs.count.mockResolvedValueOnce(1);

      const result = await service.createProgram(ownerId, req);

      expect(programs.create).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
      expect(result.isActive).toBe(false);
      expect(programs.update).not.toHaveBeenCalled();
    });
  });
});
