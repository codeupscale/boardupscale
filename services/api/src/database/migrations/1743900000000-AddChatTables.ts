import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: AddChatTables
 *
 * Creates the chat_conversations and chat_messages tables that were missing
 * from the initial schema despite the entities already existing in code.
 *
 * Tables created:
 *   chat_conversations
 *     Full tenant-scoped conversation container (organization_id, project_id,
 *     user_id). Supports soft deletes via deleted_at.
 *
 *   chat_messages
 *     Individual turns within a conversation. Stores role, content, token
 *     usage, and arbitrary metadata as JSONB.
 *
 * Gate checks:
 *   ✓ All FK columns NOT NULL — referential integrity enforced
 *   ✓ organization_id present on chat_conversations — tenant isolation
 *   ✓ Composite index on (organization_id, project_id, user_id)
 *   ✓ Index on (conversation_id, created_at) for message pagination
 *   ✓ Full down() drops tables in reverse dependency order
 */
export class AddChatTables1743900000000 implements MigrationInterface {
  name = 'AddChatTables1743900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        project_id        UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title             VARCHAR(200) NOT NULL DEFAULT 'New conversation',
        last_message_at   TIMESTAMPTZ NULL,
        deleted_at        TIMESTAMPTZ NULL,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id   UUID        NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
        role              VARCHAR(20) NOT NULL,
        content           TEXT        NOT NULL,
        tokens_used       INT         NOT NULL DEFAULT 0,
        metadata          JSONB       NULL,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_conversations_org_proj_user
        ON chat_conversations (organization_id, project_id, user_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created
        ON chat_messages (conversation_id, created_at)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS chat_messages`);
    await queryRunner.query(`DROP TABLE IF EXISTS chat_conversations`);
  }
}
