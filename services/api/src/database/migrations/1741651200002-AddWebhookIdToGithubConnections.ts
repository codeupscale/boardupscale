import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWebhookIdToGithubConnections1741651200002
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "github_connections" ADD COLUMN IF NOT EXISTS "webhook_id" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "github_connections" DROP COLUMN IF EXISTS "webhook_id"`,
    );
  }
}
