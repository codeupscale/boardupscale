import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMessagingTables1744200000000 implements MigrationInterface {
  name = 'AddMessagingTables1744200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create channel type enum
    await queryRunner.query(`
      CREATE TYPE "messaging_channel_type_enum" AS ENUM ('direct', 'group')
    `);

    // Create message type enum
    await queryRunner.query(`
      CREATE TYPE "messaging_message_type_enum" AS ENUM ('text', 'system')
    `);

    // Create messaging_channels table
    await queryRunner.query(`
      CREATE TABLE "messaging_channels" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" uuid NOT NULL,
        "type" "messaging_channel_type_enum" NOT NULL DEFAULT 'group',
        "name" varchar(255),
        "created_by_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_messaging_channels" PRIMARY KEY ("id"),
        CONSTRAINT "FK_messaging_channels_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_messaging_channels_created_by" FOREIGN KEY ("created_by_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_messaging_channels_org" ON "messaging_channels" ("organization_id")
    `);

    // Create messaging_channel_members table
    await queryRunner.query(`
      CREATE TABLE "messaging_channel_members" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "channel_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "joined_at" TIMESTAMP NOT NULL DEFAULT now(),
        "last_read_at" TIMESTAMPTZ,
        CONSTRAINT "PK_messaging_channel_members" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_messaging_channel_member" UNIQUE ("channel_id", "user_id"),
        CONSTRAINT "FK_messaging_channel_members_channel" FOREIGN KEY ("channel_id")
          REFERENCES "messaging_channels"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_messaging_channel_members_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_messaging_channel_members_user" ON "messaging_channel_members" ("user_id")
    `);

    // Create messaging_messages table
    await queryRunner.query(`
      CREATE TABLE "messaging_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "channel_id" uuid NOT NULL,
        "sender_id" uuid NOT NULL,
        "content" text NOT NULL,
        "type" "messaging_message_type_enum" NOT NULL DEFAULT 'text',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_messaging_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_messaging_messages_channel" FOREIGN KEY ("channel_id")
          REFERENCES "messaging_channels"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_messaging_messages_sender" FOREIGN KEY ("sender_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_messaging_messages_channel_created"
        ON "messaging_messages" ("channel_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "messaging_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "messaging_channel_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "messaging_channels"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "messaging_message_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "messaging_channel_type_enum"`);
  }
}
