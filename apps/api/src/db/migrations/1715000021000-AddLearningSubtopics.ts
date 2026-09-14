import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLearningSubtopics1715000021000 implements MigrationInterface {
  name = 'AddLearningSubtopics1715000021000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE learning_subtopic (
        id BIGSERIAL PRIMARY KEY, topic_id BIGINT NOT NULL REFERENCES learning_topic(id) ON DELETE CASCADE,
        title VARCHAR(160) NOT NULL, description TEXT, position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by_id BIGINT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_by_id BIGINT, deleted_at TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_learning_subtopic_topic_position ON learning_subtopic(topic_id, position)`);
    await qr.query(`ALTER TABLE learning_item ADD COLUMN subtopic_id BIGINT REFERENCES learning_subtopic(id) ON DELETE CASCADE`);
    await qr.query(`CREATE INDEX idx_learning_item_subtopic_position ON learning_item(subtopic_id, position)`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS idx_learning_item_subtopic_position`);
    await qr.query(`ALTER TABLE learning_item DROP COLUMN IF EXISTS subtopic_id`);
    await qr.query(`DROP TABLE IF EXISTS learning_subtopic CASCADE`);
  }
}
