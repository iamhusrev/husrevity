import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Roles } from '../common/roles.decorator';

export interface TableDriftReport {
  table: string;
  legacyRows: number;
  mirroredRows: number;
  missingInItems: number;
  orphanItems: number;
}

const COVERED_TABLES = ['task', 'reminder', 'calendar_event', 'time_block'] as const;

@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/item-mirror')
export class ItemMirrorAdminController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('drift')
  async getDrift(): Promise<TableDriftReport[]> {
    const results: TableDriftReport[] = [];

    for (const table of COVERED_TABLES) {
      const [row] = await this.dataSource.query(
        `SELECT
          (SELECT COUNT(*)::int FROM "${table}" WHERE deleted_at IS NULL) AS "legacyRows",
          (SELECT COUNT(*)::int FROM items WHERE legacy_table = $1 AND deleted_at IS NULL) AS "mirroredRows",
          (SELECT COUNT(*)::int FROM "${table}" l
             WHERE l.deleted_at IS NULL
               AND NOT EXISTS (
                 SELECT 1 FROM items i
                 WHERE i.legacy_table = $1 AND i.legacy_id = l.id AND i.deleted_at IS NULL
               )) AS "missingInItems",
          (SELECT COUNT(*)::int FROM items i
             WHERE i.legacy_table = $1 AND i.deleted_at IS NULL
               AND NOT EXISTS (
                 SELECT 1 FROM "${table}" l
                 WHERE l.id = i.legacy_id AND l.deleted_at IS NULL
               )) AS "orphanItems"`,
        [table],
      );

      results.push({
        table,
        legacyRows: Number(row?.legacyRows ?? 0),
        mirroredRows: Number(row?.mirroredRows ?? 0),
        // Anti-join counts, deliberately not `legacyRows - mirroredRows`: a net
        // difference lets orphans cancel out missing rows and can go negative.
        missingInItems: Number(row?.missingInItems ?? 0),
        orphanItems: Number(row?.orphanItems ?? 0),
      });
    }

    return results;
  }
}
