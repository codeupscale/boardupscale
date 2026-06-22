import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectPortabilityJobs1747900000000 implements MigrationInterface {
  name = 'AddProjectPortabilityJobs1747900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS project_portability_jobs (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        triggered_by_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        source_project_id   UUID REFERENCES projects(id) ON DELETE SET NULL,
        target_project_id   UUID REFERENCES projects(id) ON DELETE SET NULL,
        bundle_file_path    TEXT,
        bundle_export_id    UUID,
        status              VARCHAR(20) NOT NULL DEFAULT 'pending',
        target_type         VARCHAR(20) NOT NULL,
        target_project_key  VARCHAR(10) NOT NULL,
        target_project_name VARCHAR(255) NOT NULL,
        source_type         VARCHAR(20),
        import_options      JSONB,
        preview_result      JSONB,
        current_phase       SMALLINT NOT NULL DEFAULT 0,
        completed_phases    JSONB NOT NULL DEFAULT '[]',
        current_offset      INT NOT NULL DEFAULT 0,
        total_issues        INT NOT NULL DEFAULT 0,
        processed_issues    INT NOT NULL DEFAULT 0,
        failed_issues       INT NOT NULL DEFAULT 0,
        total_comments      INT NOT NULL DEFAULT 0,
        processed_comments  INT NOT NULL DEFAULT 0,
        total_sprints       INT NOT NULL DEFAULT 0,
        processed_sprints   INT NOT NULL DEFAULT 0,
        result_summary      JSONB,
        error_log           JSONB,
        started_at          TIMESTAMPTZ,
        completed_at        TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_portability_jobs_org
        ON project_portability_jobs (organization_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_portability_jobs_triggered_by
        ON project_portability_jobs (triggered_by_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_portability_jobs_status
        ON project_portability_jobs (organization_id, status)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS project_portability_jobs`);
  }
}
