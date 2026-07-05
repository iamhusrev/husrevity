import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectPinnedArchived1715000010000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE project ADD COLUMN pinned BOOLEAN NOT NULL DEFAULT false`);
    await queryRunner.query(
      `ALTER TABLE project ADD COLUMN archived BOOLEAN NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_project_owner_archived ON project(owner_id, archived)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_project_owner_archived`);
    await queryRunner.query(`ALTER TABLE project DROP COLUMN archived`);
    await queryRunner.query(`ALTER TABLE project DROP COLUMN pinned`);
  }
}
