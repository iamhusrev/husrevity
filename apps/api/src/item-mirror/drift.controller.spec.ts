import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { ItemMirrorAdminController, TableDriftReport } from './item-mirror-admin.controller';
import { RolesGuard } from '../common/roles.guard';
import { ApiException } from '../common/api.exception';
import { ROLES_KEY } from '../common/roles.decorator';

describe('ItemMirrorAdminController (contract tests)', () => {
  let controller: ItemMirrorAdminController;
  let dataSource: { query: jest.Mock };
  let rolesGuard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    dataSource = {
      query: jest.fn(),
    };
    controller = new ItemMirrorAdminController(dataSource as unknown as DataSource);
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);
  });

  describe('GET /api/admin/item-mirror/drift response shape', () => {
    it('returns an array of TableDriftReport containing only counts and table name', async () => {
      dataSource.query.mockImplementation(async (sql: string, params: any[]) => {
        const table = params[0];
        // missingInItems and orphanItems come from dedicated anti-join
        // counts, so they are NOT derivable from legacyRows - mirroredRows.
        if (table === 'task') {
          return [{ legacyRows: 10, mirroredRows: 8, missingInItems: 3, orphanItems: 1 }];
        }
        if (table === 'reminder') {
          return [{ legacyRows: 5, mirroredRows: 5, missingInItems: 0, orphanItems: 0 }];
        }
        if (table === 'calendar_event') {
          return [{ legacyRows: 2, mirroredRows: 3, missingInItems: 0, orphanItems: 1 }];
        }
        if (table === 'time_block') {
          return [{ legacyRows: 7, mirroredRows: 7, missingInItems: 0, orphanItems: 0 }];
        }
        return [{ legacyRows: 0, mirroredRows: 0, missingInItems: 0, orphanItems: 0 }];
      });

      const result: TableDriftReport[] = await controller.getDrift();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(4);

      const expectedTables = ['task', 'reminder', 'calendar_event', 'time_block'];

      for (const item of result) {
        expect(expectedTables).toContain(item.table);
        expect(typeof item.table).toBe('string');
        expect(typeof item.legacyRows).toBe('number');
        expect(typeof item.mirroredRows).toBe('number');
        expect(typeof item.missingInItems).toBe('number');
        expect(typeof item.orphanItems).toBe('number');

        // Strictly counts only: no row data, titles, descriptions
        const keys = Object.keys(item);
        expect(keys.sort()).toEqual(
          ['table', 'legacyRows', 'mirroredRows', 'missingInItems', 'orphanItems'].sort(),
        );
      }

      // Values are passed through from the dedicated counts: 3 missing even
      // though legacyRows - mirroredRows would say 2 (orphans cancel out).
      const taskReport = result.find((r) => r.table === 'task');
      expect(taskReport).toEqual({
        table: 'task',
        legacyRows: 10,
        mirroredRows: 8,
        missingInItems: 3,
        orphanItems: 1,
      });

      // More mirrored rows than legacy rows must never yield a negative count.
      const calReport = result.find((r) => r.table === 'calendar_event');
      expect(calReport).toEqual({
        table: 'calendar_event',
        legacyRows: 2,
        mirroredRows: 3,
        missingInItems: 0,
        orphanItems: 1,
      });
    });
  });

  describe('drift query shape', () => {
    it('counts missing and orphan rows with anti-joins, never NOT IN or a net difference', async () => {
      dataSource.query.mockResolvedValue([
        { legacyRows: 0, mirroredRows: 0, missingInItems: 0, orphanItems: 0 },
      ]);

      await controller.getDrift();

      expect(dataSource.query).toHaveBeenCalledTimes(4);
      for (const [sql] of dataSource.query.mock.calls as [string][]) {
        const normalized = sql.replace(/\s+/g, ' ').toUpperCase();
        expect(normalized).toContain('NOT EXISTS');
        expect(normalized).not.toContain('NOT IN');
        expect(normalized).toContain('"MISSINGINITEMS"');
        expect(normalized).toContain('"ORPHANITEMS"');
      }
    });
  });

  describe('Authorization and role guard contract', () => {
    function createMockContext(user?: any) {
      return {
        getHandler: () => controller.getDrift,
        getClass: () => ItemMirrorAdminController,
        switchToHttp: () => ({
          getRequest: () => ({ user }),
        }),
      } as any;
    }

    it("requires exactly the 'admin' role, like the other admin controllers", () => {
      const roles = reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        controller.getDrift,
        ItemMirrorAdminController,
      ]);
      expect(roles).toEqual(['admin']);
    });

    it('throws 401 Unauthorized when unauthenticated (user is undefined)', () => {
      const ctx = createMockContext(undefined);
      expect(() => rolesGuard.canActivate(ctx)).toThrow(ApiException);
      try {
        rolesGuard.canActivate(ctx);
      } catch (err: any) {
        expect(err.getStatus()).toBe(401);
      }
    });

    it('throws 403 Forbidden when user has non-admin role (role is "user")', () => {
      const ctx = createMockContext({ userId: '1', role: 'user' });
      expect(() => rolesGuard.canActivate(ctx)).toThrow(ApiException);
      try {
        rolesGuard.canActivate(ctx);
      } catch (err: any) {
        expect(err.getStatus()).toBe(403);
      }
    });

    it('does not accept a role string the app never issues (ROLE_ADMIN)', () => {
      const ctx = createMockContext({ userId: '1', role: 'ROLE_ADMIN' });
      expect(() => rolesGuard.canActivate(ctx)).toThrow(ApiException);
    });

    it('allows access when user has admin role', () => {
      const ctx = createMockContext({ userId: '1', role: 'admin' });
      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });
  });
});
