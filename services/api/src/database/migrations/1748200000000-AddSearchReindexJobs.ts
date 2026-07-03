import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSearchReindexJobs1748200000000 implements MigrationInterface {
  public readonly name = 'AddSearchReindexJobs1748200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "search_reindex_jobs" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id"   uuid NOT NULL,
        "project_id"        uuid NOT NULL,
        "triggered_by_id"   uuid,
        "status"            varchar(20) NOT NULL DEFAULT 'pending',
        "current_phase"     smallint NOT NULL DEFAULT 0,
        "current_offset"    int NOT NULL DEFAULT 0,
        "completed_phases"  jsonb NOT NULL DEFAULT '[]'::jsonb,
        "total_issues"      int NOT NULL DEFAULT 0,
        "processed_issues"  int NOT NULL DEFAULT 0,
        "total_members"     int NOT NULL DEFAULT 0,
        "processed_members" int NOT NULL DEFAULT 0,
        "error_log"         jsonb,
        "started_at"        timestamptz,
        "completed_at"      timestamptz,
        "created_at"        timestamptz NOT NULL DEFAULT now(),
        "updated_at"        timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_search_reindex_jobs_org"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_search_reindex_jobs_project"
          FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_search_reindex_jobs_triggered_by"
          FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_search_reindex_jobs_org"
        ON "search_reindex_jobs" ("organization_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_search_reindex_jobs_project"
        ON "search_reindex_jobs" ("project_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_search_reindex_jobs_active"
        ON "search_reindex_jobs" ("organization_id", "project_id", "status")
        WHERE "status" IN ('pending', 'processing')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_search_reindex_jobs_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_search_reindex_jobs_project"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_search_reindex_jobs_org"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "search_reindex_jobs"`);
  }
}
