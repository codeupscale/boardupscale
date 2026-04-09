import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiEnhancements1744100000000 implements MigrationInterface {
  name = 'AddAiEnhancements1744100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Composite index for daily token limit queries (was missing)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_usage_log_org_created
      ON ai_usage_log (organization_id, created_at DESC)
    `);

    // 2. Index for per-user token queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_usage_log_user_org_created
      ON ai_usage_log (user_id, organization_id, created_at DESC)
      WHERE user_id IS NOT NULL
    `);

    // 3. Chat feedback table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_feedback (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
        user_id UUID NOT NULL,
        organization_id UUID NOT NULL,
        rating SMALLINT NOT NULL CHECK (rating IN (-1, 1)),
        comment TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_feedback_message_user
      ON chat_feedback (message_id, user_id)
    `);

    // 4. Vector similarity index (if pgvector extension is available)
    try {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_issues_embedding_ivfflat
        ON issues USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
      `);
    } catch (err) {
      // pgvector may not be installed or embedding column may be float8[]
      // Silently skip — vector search will fall back gracefully
      console.log('[Migration] Skipping IVFFlat index — pgvector extension or vector column not available');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`DROP INDEX IF EXISTS idx_issues_embedding_ivfflat`);
    } catch {
      // May not exist
    }
    await queryRunner.query(`DROP INDEX IF EXISTS idx_chat_feedback_message_user`);
    await queryRunner.query(`DROP TABLE IF EXISTS chat_feedback`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ai_usage_log_user_org_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ai_usage_log_org_created`);
  }
}
