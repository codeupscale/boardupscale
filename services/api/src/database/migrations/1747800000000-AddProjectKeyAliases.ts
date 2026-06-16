import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stores historical project keys so API/URL lookups by an old key still resolve
 * to the same project after a key rename (Jira-style alias / redirect).
 *
 * Old keys remain reserved per organization — they cannot be assigned to a new project.
 */
export class AddProjectKeyAliases1747800000000 implements MigrationInterface {
  name = 'AddProjectKeyAliases1747800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "project_key_aliases" (
        "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid                     NOT NULL,
        "project_id"      uuid                     NOT NULL,
        "old_key"         character varying(10)    NOT NULL,
        "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_project_key_aliases" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_project_key_aliases_org_old_key" UNIQUE ("organization_id", "old_key")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "project_key_aliases"
        ADD CONSTRAINT "FK_project_key_aliases_organization_id"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "project_key_aliases"
        ADD CONSTRAINT "FK_project_key_aliases_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_project_key_aliases_project_id"
        ON "project_key_aliases" ("project_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_project_key_aliases_project_id"`);
    await queryRunner.query(
      `ALTER TABLE "project_key_aliases" DROP CONSTRAINT IF EXISTS "FK_project_key_aliases_project_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_key_aliases" DROP CONSTRAINT IF EXISTS "FK_project_key_aliases_organization_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "project_key_aliases"`);
  }
}
