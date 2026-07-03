import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * GIN trigram indexes for global search ILIKE patterns on issues, projects, and users.
 * pg_trgm is enabled in InitialSchema — these indexes accelerate `%term%` lookups.
 */
export class AddSearchTrigramIndexes1748000000000 implements MigrationInterface {
  public readonly name = 'AddSearchTrigramIndexes1748000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_issues_title_trgm"
        ON "issues" USING gin ("title" gin_trgm_ops)
        WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_issues_key_trgm"
        ON "issues" USING gin ("key" gin_trgm_ops)
        WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_issues_description_trgm"
        ON "issues" USING gin ("description" gin_trgm_ops)
        WHERE "deleted_at" IS NULL
          AND "description" IS NOT NULL
          AND "description" <> ''
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_projects_name_trgm"
        ON "projects" USING gin ("name" gin_trgm_ops)
        WHERE "status" != 'archived'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_projects_key_trgm"
        ON "projects" USING gin ("key" gin_trgm_ops)
        WHERE "status" != 'archived'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_display_name_trgm"
        ON "users" USING gin ("display_name" gin_trgm_ops)
        WHERE "is_active" = true
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_email_trgm"
        ON "users" USING gin ("email" gin_trgm_ops)
        WHERE "is_active" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_email_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_display_name_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_projects_key_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_projects_name_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_issues_description_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_issues_key_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_issues_title_trgm"`);
  }
}
