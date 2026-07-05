import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRoutineSegmentDaysOfWeek1715000009000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE routine_segment ADD COLUMN days_of_week SMALLINT NOT NULL DEFAULT 127`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE routine_segment DROP COLUMN days_of_week`);
  }
}
