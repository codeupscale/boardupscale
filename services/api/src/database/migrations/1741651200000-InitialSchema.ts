import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema migration — Boardupscale v1.0.0
 *
 * Creates every table, index, and constraint required by the 35 TypeORM
 * entities.  Replaces the legacy scripts/init-db.sql bootstrap file.
 *
 * Extensions (pgcrypto, pg_trgm, pgvector) are created here so that the
 * database requires no manual pre-seeding.
 */
export class InitialSchema1741651200000 implements MigrationInterface {
  public readonly name = 'InitialSchema1741651200000';

  // ─── UP ──────────────────────────────────────────────────────────────────

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Extensions ─────────────────────────────────────────────────────────

    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE EXTENSION IF NOT EXISTS "vector";
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'pgvector not available — embedding column will use float8[]';
      END $$
    `);

    // ── organizations ───────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "organizations" (
        "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "name"       character varying(255)   NOT NULL,
        "slug"       character varying(100)   NOT NULL,
        "settings"   jsonb                             DEFAULT '{}',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_organizations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_organizations_slug" UNIQUE ("slug")
      )
    `);

    // ── users ───────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"                          uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"             uuid,
        "email"                       character varying(255)   NOT NULL,
        "display_name"                character varying(255)   NOT NULL,
        "avatar_url"                  text,
        "password_hash"               character varying(255),
        "role"                        character varying(50)    NOT NULL DEFAULT 'member',
        "is_active"                   boolean                  NOT NULL DEFAULT true,
        "email_verified"              boolean                  NOT NULL DEFAULT false,
        "timezone"                    character varying(100),
        "language"                    character varying(10)    NOT NULL DEFAULT 'en',
        "oauth_provider"              character varying(50),
        "oauth_id"                    character varying(255),
        "last_login_at"               TIMESTAMP WITH TIME ZONE,
        "email_verification_token"    character varying(255),
        "email_verification_expiry"   TIMESTAMP WITH TIME ZONE,
        "password_reset_token"        character varying(255),
        "password_reset_expiry"       TIMESTAMP WITH TIME ZONE,
        "failed_login_attempts"       integer                  NOT NULL DEFAULT 0,
        "locked_until"                TIMESTAMP WITH TIME ZONE,
        "notification_preferences"    jsonb                    NOT NULL DEFAULT '{"email":true,"inApp":true}',
        "two_fa_secret"               text,
        "two_fa_enabled"              boolean                  NOT NULL DEFAULT false,
        "backup_codes"                text[],
        "created_at"                  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"                  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users"         PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email"   UNIQUE ("email")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "FK_users_organization_id"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_users_organization_id" ON "users" ("organization_id")`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_users_oauth"
        ON "users" ("oauth_provider", "oauth_id")
        WHERE oauth_provider IS NOT NULL AND oauth_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_users_email_verification_token"
        ON "users" ("email_verification_token")
        WHERE email_verification_token IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_users_password_reset_token"
        ON "users" ("password_reset_token")
        WHERE password_reset_token IS NOT NULL
    `);

    // ── refresh_tokens ──────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "user_id"     uuid                     NOT NULL,
        "token_hash"  text                     NOT NULL,
        "expires_at"  TIMESTAMP                NOT NULL,
        "revoked_at"  TIMESTAMP,
        "ip_address"  character varying(45),
        "user_agent"  text,
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
        ADD CONSTRAINT "FK_refresh_tokens_user_id"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_user_id" ON "refresh_tokens" ("user_id")`);

    // ── permissions ─────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "permissions" (
        "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "resource"    character varying(50)    NOT NULL,
        "action"      character varying(50)    NOT NULL,
        "description" text,
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_permissions"                    PRIMARY KEY ("id"),
        CONSTRAINT "UQ_permissions_resource_action"    UNIQUE ("resource", "action")
      )
    `);

    // ── roles ───────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid,
        "name"            character varying(100)   NOT NULL,
        "description"     text,
        "is_system"       boolean                  NOT NULL DEFAULT false,
        "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_roles"          PRIMARY KEY ("id"),
        CONSTRAINT "UQ_roles_org_name" UNIQUE ("organization_id", "name")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "roles"
        ADD CONSTRAINT "FK_roles_organization_id"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE NO ACTION
    `);
    await queryRunner.query(`CREATE INDEX "IDX_roles_organization_id" ON "roles" ("organization_id")`);

    // ── role_permissions (ManyToMany join — generated by @JoinTable on Role) ─

    await queryRunner.query(`
      CREATE TABLE "role_permissions" (
        "role_id"       uuid NOT NULL,
        "permission_id" uuid NOT NULL,
        CONSTRAINT "PK_role_permissions" PRIMARY KEY ("role_id", "permission_id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "role_permissions"
        ADD CONSTRAINT "FK_role_permissions_role_id"
        FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "role_permissions"
        ADD CONSTRAINT "FK_role_permissions_permission_id"
        FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_role_permissions_role_id"       ON "role_permissions" ("role_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_role_permissions_permission_id" ON "role_permissions" ("permission_id")`);

    // ── projects ────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "projects" (
        "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"     uuid                     NOT NULL,
        "name"                character varying(255)   NOT NULL,
        "key"                 character varying(10)    NOT NULL,
        "description"         text,
        "type"                character varying(50)    NOT NULL DEFAULT 'scrum',
        "status"              character varying(50)    NOT NULL DEFAULT 'active',
        "icon_url"            text,
        "color"               character varying(7),
        "owner_id"            uuid                     NOT NULL,
        "next_issue_number"   integer                  NOT NULL DEFAULT 1,
        "settings"            jsonb,
        "created_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_projects"         PRIMARY KEY ("id"),
        CONSTRAINT "UQ_projects_org_key" UNIQUE ("organization_id", "key")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "projects"
        ADD CONSTRAINT "FK_projects_organization_id"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "projects"
        ADD CONSTRAINT "FK_projects_owner_id"
        FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION
    `);
    await queryRunner.query(`CREATE INDEX "IDX_projects_organization_id" ON "projects" ("organization_id")`);

    // ── project_members ─────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "project_members" (
        "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "project_id" uuid                     NOT NULL,
        "user_id"    uuid                     NOT NULL,
        "role"       character varying(50)    NOT NULL DEFAULT 'developer',
        "role_id"    uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_project_members"              PRIMARY KEY ("id"),
        CONSTRAINT "UQ_project_members_project_user" UNIQUE ("project_id", "user_id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "project_members"
        ADD CONSTRAINT "FK_project_members_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "project_members"
        ADD CONSTRAINT "FK_project_members_user_id"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "project_members"
        ADD CONSTRAINT "FK_project_members_role_id"
        FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE NO ACTION
    `);
    await queryRunner.query(`CREATE INDEX "IDX_project_members_project_id" ON "project_members" ("project_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_project_members_user_id"    ON "project_members" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_project_members_role_id"    ON "project_members" ("role_id")`);

    // ── issue_statuses ──────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "issue_statuses" (
        "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "project_id" uuid                     NOT NULL,
        "name"       character varying(100)   NOT NULL,
        "category"   character varying(50)    NOT NULL DEFAULT 'todo',
        "color"      character varying(7)     NOT NULL DEFAULT '#6B7280',
        "position"   integer                  NOT NULL DEFAULT 0,
        "is_default" boolean                  NOT NULL DEFAULT false,
        "wip_limit"  integer                  NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_issue_statuses" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "issue_statuses"
        ADD CONSTRAINT "FK_issue_statuses_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_issue_statuses_project_id" ON "issue_statuses" ("project_id")`);

    // ── sprints ─────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "sprints" (
        "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "project_id"   uuid                     NOT NULL,
        "name"         character varying(255)   NOT NULL,
        "goal"         text,
        "status"       character varying(50)    NOT NULL DEFAULT 'planned',
        "start_date"   date,
        "end_date"     date,
        "completed_at" TIMESTAMP,
        "created_at"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sprints" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "sprints"
        ADD CONSTRAINT "FK_sprints_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_sprints_project_id" ON "sprints" ("project_id")`);

    // ── issues ──────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "issues" (
        "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid                     NOT NULL,
        "project_id"      uuid                     NOT NULL,
        "sprint_id"       uuid,
        "status_id"       uuid,
        "reporter_id"     uuid                     NOT NULL,
        "assignee_id"     uuid,
        "parent_id"       uuid,
        "number"          integer                  NOT NULL,
        "key"             character varying(50)    NOT NULL,
        "title"           character varying(500)   NOT NULL,
        "description"     text,
        "type"            character varying(50)    NOT NULL DEFAULT 'task',
        "priority"        character varying(50)    NOT NULL DEFAULT 'medium',
        "story_points"    integer,
        "time_estimate"   integer,
        "time_spent"      integer                  NOT NULL DEFAULT 0,
        "due_date"        date,
        "labels"          text[]                   NOT NULL DEFAULT '{}',
        "position"        double precision         NOT NULL DEFAULT 0,
        "deleted_at"      TIMESTAMP WITH TIME ZONE,
        "embedding"       float8[],
        "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_issues"               PRIMARY KEY ("id"),
        CONSTRAINT "UQ_issues_project_number" UNIQUE ("project_id", "number")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "issues" ADD CONSTRAINT "FK_issues_organization_id"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "issues" ADD CONSTRAINT "FK_issues_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "issues" ADD CONSTRAINT "FK_issues_sprint_id"
        FOREIGN KEY ("sprint_id") REFERENCES "sprints"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "issues" ADD CONSTRAINT "FK_issues_status_id"
        FOREIGN KEY ("status_id") REFERENCES "issue_statuses"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "issues" ADD CONSTRAINT "FK_issues_reporter_id"
        FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "issues" ADD CONSTRAINT "FK_issues_assignee_id"
        FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "issues" ADD CONSTRAINT "FK_issues_parent_id"
        FOREIGN KEY ("parent_id") REFERENCES "issues"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE INDEX "IDX_issues_project_id"      ON "issues" ("project_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_issues_organization_id" ON "issues" ("organization_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_issues_sprint_id"       ON "issues" ("sprint_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_issues_assignee_id"     ON "issues" ("assignee_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_issues_status_id"       ON "issues" ("status_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_issues_parent_id"       ON "issues" ("parent_id")`);
    await queryRunner.query(`
      CREATE INDEX "IDX_issues_deleted_at" ON "issues" ("deleted_at") WHERE deleted_at IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_issues_title_trgm" ON "issues" USING GIN ("title" gin_trgm_ops)
    `);

    // ── issue_links ─────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "issue_links" (
        "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "source_issue_id" uuid                     NOT NULL,
        "target_issue_id" uuid                     NOT NULL,
        "link_type"       character varying(50)    NOT NULL,
        "created_by"      uuid                     NOT NULL,
        "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_issue_links"  PRIMARY KEY ("id"),
        CONSTRAINT "UQ_issue_links"  UNIQUE ("source_issue_id", "target_issue_id", "link_type")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "issue_links" ADD CONSTRAINT "FK_issue_links_source_issue_id"
        FOREIGN KEY ("source_issue_id") REFERENCES "issues"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "issue_links" ADD CONSTRAINT "FK_issue_links_target_issue_id"
        FOREIGN KEY ("target_issue_id") REFERENCES "issues"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "issue_links" ADD CONSTRAINT "FK_issue_links_created_by"
        FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION
    `);
    await queryRunner.query(`CREATE INDEX "IDX_issue_links_source_issue_id" ON "issue_links" ("source_issue_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_issue_links_target_issue_id" ON "issue_links" ("target_issue_id")`);

    // ── issue_watchers ───────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "issue_watchers" (
        "issue_id"   uuid                     NOT NULL,
        "user_id"    uuid                     NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_issue_watchers" PRIMARY KEY ("issue_id", "user_id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "issue_watchers" ADD CONSTRAINT "FK_issue_watchers_issue_id"
        FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "issue_watchers" ADD CONSTRAINT "FK_issue_watchers_user_id"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_issue_watchers_issue_id" ON "issue_watchers" ("issue_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_issue_watchers_user_id"  ON "issue_watchers" ("user_id")`);

    // ── comments ────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "comments" (
        "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "issue_id"   uuid                     NOT NULL,
        "author_id"  uuid                     NOT NULL,
        "content"    text                     NOT NULL,
        "deleted_at" TIMESTAMP,
        "edited_at"  TIMESTAMP,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_comments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "comments" ADD CONSTRAINT "FK_comments_issue_id"
        FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "comments" ADD CONSTRAINT "FK_comments_author_id"
        FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE NO ACTION
    `);
    await queryRunner.query(`CREATE INDEX "IDX_comments_issue_id" ON "comments" ("issue_id")`);

    // ── attachments ─────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "attachments" (
        "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "issue_id"       uuid,
        "comment_id"     uuid,
        "uploaded_by"    uuid                     NOT NULL,
        "file_name"      character varying(500)   NOT NULL,
        "file_size"      bigint                   NOT NULL,
        "mime_type"      character varying(255)   NOT NULL,
        "storage_key"    text                     NOT NULL,
        "storage_bucket" character varying(255)   NOT NULL,
        "created_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_attachments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "attachments" ADD CONSTRAINT "FK_attachments_issue_id"
        FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "attachments" ADD CONSTRAINT "FK_attachments_uploaded_by"
        FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE NO ACTION
    `);
    await queryRunner.query(`CREATE INDEX "IDX_attachments_issue_id" ON "attachments" ("issue_id")`);

    // ── notifications ────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "user_id"    uuid                     NOT NULL,
        "type"       character varying(100)   NOT NULL,
        "title"      character varying(500)   NOT NULL,
        "body"       text,
        "data"       jsonb,
        "read_at"    TIMESTAMP,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "notifications" ADD CONSTRAINT "FK_notifications_user_id"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_notifications_user_id" ON "notifications" ("user_id")`);

    // ── work_logs ────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "work_logs" (
        "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "issue_id"    uuid                     NOT NULL,
        "user_id"     uuid                     NOT NULL,
        "time_spent"  integer                  NOT NULL,
        "description" text,
        "logged_at"   TIMESTAMP                NOT NULL,
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_work_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "work_logs" ADD CONSTRAINT "FK_work_logs_issue_id"
        FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "work_logs" ADD CONSTRAINT "FK_work_logs_user_id"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION
    `);
    await queryRunner.query(`CREATE INDEX "IDX_work_logs_issue_id" ON "work_logs" ("issue_id")`);

    // ── audit_logs ───────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid,
        "user_id"         uuid,
        "action"          character varying(255)   NOT NULL,
        "entity_type"     character varying(100),
        "entity_id"       uuid,
        "changes"         jsonb                    NOT NULL DEFAULT '{}',
        "ip_address"      inet,
        "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_audit_logs_organization_id"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_audit_logs_user_id"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_organization_id" ON "audit_logs" ("organization_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_entity"          ON "audit_logs" ("entity_type", "entity_id")`);

    // ── webhooks ─────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "webhooks" (
        "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid                     NOT NULL,
        "project_id"      uuid,
        "name"            character varying(255)   NOT NULL,
        "url"             text                     NOT NULL,
        "secret"          character varying(255),
        "events"          text[]                   NOT NULL,
        "is_active"       boolean                  NOT NULL DEFAULT true,
        "headers"         jsonb                    NOT NULL DEFAULT '{}',
        "created_by"      uuid,
        "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webhooks" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "webhooks" ADD CONSTRAINT "FK_webhooks_organization_id"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "webhooks" ADD CONSTRAINT "FK_webhooks_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "webhooks" ADD CONSTRAINT "FK_webhooks_created_by"
        FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE INDEX "IDX_webhooks_organization_id" ON "webhooks" ("organization_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_webhooks_project_id"      ON "webhooks" ("project_id")`);

    // ── webhook_deliveries ───────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "webhook_deliveries" (
        "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "webhook_id"       uuid                     NOT NULL,
        "event_type"       character varying(100)   NOT NULL,
        "payload"          jsonb                    NOT NULL,
        "response_status"  integer,
        "response_body"    text,
        "response_headers" jsonb,
        "duration_ms"      integer,
        "status"           character varying(20)    NOT NULL DEFAULT 'pending',
        "attempt"          integer                  NOT NULL DEFAULT 1,
        "next_retry_at"    TIMESTAMP WITH TIME ZONE,
        "created_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webhook_deliveries" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "FK_webhook_deliveries_webhook_id"
        FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_webhook_deliveries_webhook_id" ON "webhook_deliveries" ("webhook_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_webhook_deliveries_status"     ON "webhook_deliveries" ("status")`);

    // ── custom_field_definitions ─────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "custom_field_definitions" (
        "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid                     NOT NULL,
        "project_id"      uuid,
        "name"            character varying(255)   NOT NULL,
        "field_key"       character varying(100)   NOT NULL,
        "field_type"      character varying(50)    NOT NULL,
        "description"     text,
        "is_required"     boolean                  NOT NULL DEFAULT false,
        "default_value"   jsonb,
        "options"         jsonb,
        "position"        integer                  NOT NULL DEFAULT 0,
        "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_custom_field_definitions"                  PRIMARY KEY ("id"),
        CONSTRAINT "UQ_custom_field_defs_org_project_key"         UNIQUE ("organization_id", "project_id", "field_key")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "FK_custom_field_defs_organization_id"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "FK_custom_field_defs_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_custom_field_defs_organization_id" ON "custom_field_definitions" ("organization_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_custom_field_defs_project_id"      ON "custom_field_definitions" ("project_id")`);

    // ── custom_field_values ──────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "custom_field_values" (
        "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "issue_id"   uuid                     NOT NULL,
        "field_id"   uuid                     NOT NULL,
        "value"      jsonb                    NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_custom_field_values"            PRIMARY KEY ("id"),
        CONSTRAINT "UQ_custom_field_values_issue_field" UNIQUE ("issue_id", "field_id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "custom_field_values" ADD CONSTRAINT "FK_custom_field_values_issue_id"
        FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "custom_field_values" ADD CONSTRAINT "FK_custom_field_values_field_id"
        FOREIGN KEY ("field_id") REFERENCES "custom_field_definitions"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_custom_field_values_issue_id" ON "custom_field_values" ("issue_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_custom_field_values_field_id" ON "custom_field_values" ("field_id")`);

    // ── components ───────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "components" (
        "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "project_id"  uuid                     NOT NULL,
        "name"        character varying(255)   NOT NULL,
        "description" text,
        "lead_id"     uuid,
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_components"              PRIMARY KEY ("id"),
        CONSTRAINT "UQ_components_project_name" UNIQUE ("project_id", "name")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "components" ADD CONSTRAINT "FK_components_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "components" ADD CONSTRAINT "FK_components_lead_id"
        FOREIGN KEY ("lead_id") REFERENCES "users"("id") ON DELETE NO ACTION
    `);
    await queryRunner.query(`CREATE INDEX "IDX_components_project_id" ON "components" ("project_id")`);

    // ── issue_components ─────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "issue_components" (
        "issue_id"     uuid NOT NULL,
        "component_id" uuid NOT NULL,
        CONSTRAINT "PK_issue_components" PRIMARY KEY ("issue_id", "component_id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "issue_components" ADD CONSTRAINT "FK_issue_components_issue_id"
        FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "issue_components" ADD CONSTRAINT "FK_issue_components_component_id"
        FOREIGN KEY ("component_id") REFERENCES "components"("id") ON DELETE CASCADE
    `);

    // ── versions ─────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "versions" (
        "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "project_id"   uuid                     NOT NULL,
        "name"         character varying(100)   NOT NULL,
        "description"  text,
        "status"       character varying(20)    NOT NULL DEFAULT 'unreleased',
        "start_date"   date,
        "release_date" date,
        "released_at"  TIMESTAMP WITH TIME ZONE,
        "created_at"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_versions"              PRIMARY KEY ("id"),
        CONSTRAINT "UQ_versions_project_name" UNIQUE ("project_id", "name")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "versions" ADD CONSTRAINT "FK_versions_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_versions_project_id" ON "versions" ("project_id")`);

    // ── issue_versions ───────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "issue_versions" (
        "issue_id"      uuid                  NOT NULL,
        "version_id"    uuid                  NOT NULL,
        "relation_type" character varying(20) NOT NULL DEFAULT 'fix',
        CONSTRAINT "PK_issue_versions" PRIMARY KEY ("issue_id", "version_id", "relation_type")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "issue_versions" ADD CONSTRAINT "FK_issue_versions_issue_id"
        FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "issue_versions" ADD CONSTRAINT "FK_issue_versions_version_id"
        FOREIGN KEY ("version_id") REFERENCES "versions"("id") ON DELETE CASCADE
    `);

    // ── automation_rules ─────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "automation_rules" (
        "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"  uuid                     NOT NULL,
        "project_id"       uuid                     NOT NULL,
        "name"             character varying(255)   NOT NULL,
        "description"      text,
        "is_active"        boolean                  NOT NULL DEFAULT true,
        "trigger_type"     character varying(50)    NOT NULL,
        "trigger_config"   jsonb                    NOT NULL DEFAULT '{}',
        "conditions"       jsonb                    NOT NULL DEFAULT '[]',
        "actions"          jsonb                    NOT NULL DEFAULT '[]',
        "execution_count"  integer                  NOT NULL DEFAULT 0,
        "last_executed_at" TIMESTAMP WITH TIME ZONE,
        "created_by"       uuid,
        "created_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_automation_rules" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "automation_rules" ADD CONSTRAINT "FK_automation_rules_organization_id"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "automation_rules" ADD CONSTRAINT "FK_automation_rules_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "automation_rules" ADD CONSTRAINT "FK_automation_rules_created_by"
        FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION
    `);
    await queryRunner.query(`CREATE INDEX "IDX_automation_rules_project_id" ON "automation_rules" ("project_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_automation_rules_is_active"  ON "automation_rules" ("is_active")`);

    // ── automation_logs ──────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "automation_logs" (
        "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "rule_id"          uuid                     NOT NULL,
        "issue_id"         uuid,
        "trigger_event"    character varying(100),
        "actions_executed" jsonb,
        "status"           character varying(20)    NOT NULL DEFAULT 'success',
        "error_message"    text,
        "executed_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_automation_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "automation_logs" ADD CONSTRAINT "FK_automation_logs_rule_id"
        FOREIGN KEY ("rule_id") REFERENCES "automation_rules"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "automation_logs" ADD CONSTRAINT "FK_automation_logs_issue_id"
        FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE NO ACTION
    `);
    await queryRunner.query(`CREATE INDEX "IDX_automation_logs_rule_id" ON "automation_logs" ("rule_id")`);

    // ── api_keys ─────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "api_keys" (
        "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "org_id"       uuid                     NOT NULL,
        "user_id"      uuid                     NOT NULL,
        "name"         character varying(255)   NOT NULL,
        "key_hash"     character varying(255)   NOT NULL,
        "key_prefix"   character varying(10)    NOT NULL,
        "scopes"       text[]                   NOT NULL DEFAULT '{}',
        "last_used_at" TIMESTAMP WITH TIME ZONE,
        "expires_at"   TIMESTAMP WITH TIME ZONE,
        "is_active"    boolean                  NOT NULL DEFAULT true,
        "created_at"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_api_keys" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "api_keys" ADD CONSTRAINT "FK_api_keys_org_id"
        FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "api_keys" ADD CONSTRAINT "FK_api_keys_user_id"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_api_keys_org_id"   ON "api_keys" ("org_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_api_keys_user_id"  ON "api_keys" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_api_keys_key_hash" ON "api_keys" ("key_hash")`);

    // ── activities ───────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "activities" (
        "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid                     NOT NULL,
        "issue_id"        uuid                     NOT NULL,
        "user_id"         uuid,
        "action"          character varying(50)    NOT NULL,
        "field"           character varying(100),
        "old_value"       text,
        "new_value"       text,
        "metadata"        jsonb,
        "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_activities" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "activities" ADD CONSTRAINT "FK_activities_organization_id"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "activities" ADD CONSTRAINT "FK_activities_issue_id"
        FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "activities" ADD CONSTRAINT "FK_activities_user_id"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE INDEX "IDX_activities_issue_id" ON "activities" ("issue_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_activities_user_id"  ON "activities" ("user_id")`);

    // ── ai_usage_log ─────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "ai_usage_log" (
        "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"   uuid                     NOT NULL,
        "user_id"           uuid,
        "feature"           character varying(100)   NOT NULL,
        "model"             character varying(100)   NOT NULL,
        "prompt_tokens"     integer                  NOT NULL DEFAULT 0,
        "completion_tokens" integer                  NOT NULL DEFAULT 0,
        "total_tokens"      integer                  NOT NULL DEFAULT 0,
        "cached"            boolean                  NOT NULL DEFAULT false,
        "latency_ms"        integer                  NOT NULL DEFAULT 0,
        "created_at"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_usage_log" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "ai_usage_log" ADD CONSTRAINT "FK_ai_usage_log_organization_id"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "ai_usage_log" ADD CONSTRAINT "FK_ai_usage_log_user_id"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE INDEX "IDX_ai_usage_log_organization_id" ON "ai_usage_log" ("organization_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_ai_usage_log_org_created"     ON "ai_usage_log" ("organization_id", "created_at")`);

    // ── github_connections ───────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "github_connections" (
        "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "project_id"             uuid                     NOT NULL,
        "organization_id"        uuid                     NOT NULL,
        "repo_owner"             character varying(255)   NOT NULL,
        "repo_name"              character varying(255)   NOT NULL,
        "installation_id"        character varying(255),
        "access_token_encrypted" text,
        "webhook_secret"         character varying(255),
        "created_at"             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_github_connections"          PRIMARY KEY ("id"),
        CONSTRAINT "UQ_github_connections_project"  UNIQUE ("project_id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "github_connections" ADD CONSTRAINT "FK_github_connections_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "github_connections" ADD CONSTRAINT "FK_github_connections_organization_id"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_github_connections_organization_id" ON "github_connections" ("organization_id")`);

    // ── github_events ────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "github_events" (
        "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "github_connection_id" uuid                     NOT NULL,
        "issue_id"             uuid,
        "event_type"           character varying(50)    NOT NULL,
        "pr_number"            integer,
        "pr_title"             text,
        "pr_url"               text,
        "branch_name"          character varying(255),
        "commit_sha"           character varying(40),
        "author"               character varying(255),
        "metadata"             jsonb                    NOT NULL DEFAULT '{}',
        "created_at"           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_github_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "github_events" ADD CONSTRAINT "FK_github_events_connection_id"
        FOREIGN KEY ("github_connection_id") REFERENCES "github_connections"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "github_events" ADD CONSTRAINT "FK_github_events_issue_id"
        FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE INDEX "IDX_github_events_connection_id" ON "github_events" ("github_connection_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_github_events_issue_id"      ON "github_events" ("issue_id")`);

    // ── billing_plans ─────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "billing_plans" (
        "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "name"           character varying(100)   NOT NULL,
        "slug"           character varying(50)    NOT NULL,
        "price_monthly"  integer                  NOT NULL DEFAULT 0,
        "price_yearly"   integer                  NOT NULL DEFAULT 0,
        "max_users"      integer                  NOT NULL DEFAULT -1,
        "max_storage_gb" integer                  NOT NULL DEFAULT 1,
        "features"       jsonb                    NOT NULL DEFAULT '{}',
        "is_active"      boolean                  NOT NULL DEFAULT true,
        "created_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_billing_plans"      PRIMARY KEY ("id"),
        CONSTRAINT "UQ_billing_plans_slug" UNIQUE ("slug")
      )
    `);

    // ── subscriptions ─────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "subscriptions" (
        "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"        uuid                     NOT NULL,
        "plan_id"                uuid                     NOT NULL,
        "status"                 character varying(50)    NOT NULL DEFAULT 'active',
        "stripe_customer_id"     character varying(255),
        "stripe_subscription_id" character varying(255),
        "current_period_start"   TIMESTAMP WITH TIME ZONE,
        "current_period_end"     TIMESTAMP WITH TIME ZONE,
        "cancel_at_period_end"   boolean                  NOT NULL DEFAULT false,
        "created_at"             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_subscriptions"              PRIMARY KEY ("id"),
        CONSTRAINT "UQ_subscriptions_organization" UNIQUE ("organization_id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_subscriptions_organization_id"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_subscriptions_plan_id"
        FOREIGN KEY ("plan_id") REFERENCES "billing_plans"("id") ON DELETE NO ACTION
    `);
    await queryRunner.query(`CREATE INDEX "IDX_subscriptions_organization_id"    ON "subscriptions" ("organization_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_subscriptions_stripe_customer_id" ON "subscriptions" ("stripe_customer_id")`);

    // ── pages ─────────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "pages" (
        "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid                     NOT NULL,
        "project_id"      uuid                     NOT NULL,
        "parent_page_id"  uuid,
        "creator_id"      uuid                     NOT NULL,
        "last_editor_id"  uuid,
        "title"           character varying(500)   NOT NULL DEFAULT 'Untitled',
        "slug"            character varying(255)   NOT NULL,
        "content"         text                     NOT NULL DEFAULT '',
        "icon"            character varying(100),
        "cover_image_url" text,
        "status"          character varying(50)    NOT NULL DEFAULT 'draft',
        "position"        integer                  NOT NULL DEFAULT 0,
        "deleted_at"      TIMESTAMP WITH TIME ZONE,
        "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pages"               PRIMARY KEY ("id"),
        CONSTRAINT "UQ_pages_project_slug"  UNIQUE ("project_id", "slug")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "pages" ADD CONSTRAINT "FK_pages_organization_id"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "pages" ADD CONSTRAINT "FK_pages_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "pages" ADD CONSTRAINT "FK_pages_parent_page_id"
        FOREIGN KEY ("parent_page_id") REFERENCES "pages"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "pages" ADD CONSTRAINT "FK_pages_creator_id"
        FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "pages" ADD CONSTRAINT "FK_pages_last_editor_id"
        FOREIGN KEY ("last_editor_id") REFERENCES "users"("id") ON DELETE NO ACTION
    `);
    await queryRunner.query(`CREATE INDEX "IDX_pages_organization_id" ON "pages" ("organization_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_pages_project_id"      ON "pages" ("project_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_pages_parent_page_id"  ON "pages" ("parent_page_id")`);
    await queryRunner.query(`
      CREATE INDEX "IDX_pages_deleted_at" ON "pages" ("deleted_at") WHERE deleted_at IS NOT NULL
    `);

    // ── saved_views ───────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "saved_views" (
        "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid                     NOT NULL,
        "project_id"      uuid                     NOT NULL,
        "creator_id"      uuid                     NOT NULL,
        "name"            character varying(255)   NOT NULL,
        "filters"         jsonb                    NOT NULL DEFAULT '{}',
        "is_shared"       boolean                  NOT NULL DEFAULT false,
        "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_saved_views" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "saved_views" ADD CONSTRAINT "FK_saved_views_organization_id"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "saved_views" ADD CONSTRAINT "FK_saved_views_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "saved_views" ADD CONSTRAINT "FK_saved_views_creator_id"
        FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_saved_views_project_id" ON "saved_views" ("project_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_saved_views_creator_id" ON "saved_views" ("creator_id")`);
  }

  // ─── DOWN ─────────────────────────────────────────────────────────────────

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse dependency order.
    await queryRunner.query(`DROP TABLE IF EXISTS "saved_views"             CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pages"                   CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subscriptions"           CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "billing_plans"           CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "github_events"           CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "github_connections"      CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_usage_log"            CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "activities"              CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "api_keys"                CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "automation_logs"         CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "automation_rules"        CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "issue_versions"          CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "versions"                CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "issue_components"        CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "components"              CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "custom_field_values"     CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "custom_field_definitions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "webhook_deliveries"      CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "webhooks"                CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"              CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "work_logs"               CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"           CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attachments"             CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "comments"                CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "issue_watchers"          CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "issue_links"             CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "issues"                  CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sprints"                 CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "issue_statuses"          CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "project_members"         CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "projects"                CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions"        CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"                   CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "permissions"             CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"          CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"                   CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organizations"           CASCADE`);
  }
}
