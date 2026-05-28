-- Phase P12: GitHub App readiness, CLI, and CI/CD integration records.

CREATE TYPE "RepositoryIntegrationProvider" AS ENUM ('GITHUB');
CREATE TYPE "GitHubInstallationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED', 'NOT_CONFIGURED');
CREATE TYPE "GitHubRepositoryStatus" AS ENUM ('CONNECTED', 'REMOVED', 'SUSPENDED');
CREATE TYPE "GitHubWebhookEventStatus" AS ENUM ('RECEIVED', 'VERIFIED', 'DENIED', 'PROCESSED', 'FAILED');
CREATE TYPE "IntegrationScanSource" AS ENUM ('GITHUB_APP', 'CLI', 'CI');
CREATE TYPE "IntegrationScanStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'PROVIDER_NOT_CONFIGURED',
  'TOKEN_ERROR',
  'MANUAL_SETUP_REQUIRED',
  'NOT_ASSESSED'
);

CREATE TABLE "github_installations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "installation_id" BIGINT NOT NULL,
  "account_login" VARCHAR(160) NOT NULL,
  "account_type" VARCHAR(80),
  "status" "GitHubInstallationStatus" NOT NULL DEFAULT 'ACTIVE',
  "connected_by_user_id" UUID,
  "suspended_at" TIMESTAMP(3),
  "deleted_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "github_installations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "github_repositories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "github_installation_id" UUID,
  "github_repository_id" BIGINT,
  "provider" "RepositoryIntegrationProvider" NOT NULL DEFAULT 'GITHUB',
  "repo_owner" VARCHAR(160) NOT NULL,
  "repo_name" VARCHAR(160) NOT NULL,
  "repo_full_name" VARCHAR(320) NOT NULL,
  "installation_id" BIGINT NOT NULL,
  "default_branch" VARCHAR(160),
  "visibility" VARCHAR(40),
  "status" "GitHubRepositoryStatus" NOT NULL DEFAULT 'CONNECTED',
  "connected_by_user_id" UUID,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "removed_at" TIMESTAMP(3),
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "github_repositories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "github_webhook_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "github_installation_id" UUID,
  "delivery_id" VARCHAR(160) NOT NULL,
  "event_name" VARCHAR(120) NOT NULL,
  "action" VARCHAR(120),
  "signature_valid" BOOLEAN NOT NULL DEFAULT false,
  "status" "GitHubWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "payload_sha256" VARCHAR(128) NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "github_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "repository_scans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "github_repository_id" UUID,
  "scan_id" UUID,
  "source" "IntegrationScanSource" NOT NULL,
  "status" "IntegrationScanStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  "branch" VARCHAR(160),
  "commit_sha" VARCHAR(80),
  "pull_request_number" INTEGER,
  "requested_by_user_id" UUID,
  "api_key_id" UUID,
  "logs" JSONB,
  "error_category" VARCHAR(120),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "repository_scans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ci_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "github_repository_id" UUID,
  "scan_id" UUID,
  "provider" VARCHAR(80) NOT NULL DEFAULT 'github_actions',
  "external_run_id" VARCHAR(160),
  "status" "IntegrationScanStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  "branch" VARCHAR(160),
  "commit_sha" VARCHAR(80),
  "requested_by_user_id" UUID,
  "api_key_id" UUID,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ci_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cli_scan_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "scan_id" UUID,
  "source" "IntegrationScanSource" NOT NULL DEFAULT 'CLI',
  "status" "IntegrationScanStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  "path_hash" VARCHAR(128),
  "requested_by_user_id" UUID,
  "api_key_id" UUID,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cli_scan_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "api_keys" ADD COLUMN "github_repository_id" UUID;

CREATE UNIQUE INDEX "github_installations_organization_id_installation_id_key" ON "github_installations"("organization_id", "installation_id");
CREATE INDEX "github_installations_installation_id_idx" ON "github_installations"("installation_id");
CREATE INDEX "github_installations_organization_id_status_idx" ON "github_installations"("organization_id", "status");

CREATE UNIQUE INDEX "github_repositories_organization_id_repo_full_name_key" ON "github_repositories"("organization_id", "repo_full_name");
CREATE INDEX "github_repositories_organization_id_status_idx" ON "github_repositories"("organization_id", "status");
CREATE INDEX "github_repositories_project_id_status_idx" ON "github_repositories"("project_id", "status");
CREATE INDEX "github_repositories_installation_id_idx" ON "github_repositories"("installation_id");

CREATE UNIQUE INDEX "github_webhook_events_delivery_id_key" ON "github_webhook_events"("delivery_id");
CREATE INDEX "github_webhook_events_organization_id_created_at_idx" ON "github_webhook_events"("organization_id", "created_at");
CREATE INDEX "github_webhook_events_event_name_created_at_idx" ON "github_webhook_events"("event_name", "created_at");

CREATE INDEX "repository_scans_organization_id_created_at_idx" ON "repository_scans"("organization_id", "created_at");
CREATE INDEX "repository_scans_github_repository_id_created_at_idx" ON "repository_scans"("github_repository_id", "created_at");
CREATE INDEX "repository_scans_scan_id_idx" ON "repository_scans"("scan_id");

CREATE INDEX "ci_runs_organization_id_created_at_idx" ON "ci_runs"("organization_id", "created_at");
CREATE INDEX "ci_runs_github_repository_id_created_at_idx" ON "ci_runs"("github_repository_id", "created_at");

CREATE INDEX "cli_scan_events_organization_id_created_at_idx" ON "cli_scan_events"("organization_id", "created_at");
CREATE INDEX "cli_scan_events_scan_id_idx" ON "cli_scan_events"("scan_id");

CREATE INDEX "api_keys_github_repository_id_status_idx" ON "api_keys"("github_repository_id", "status");

ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_connected_by_user_id_fkey" FOREIGN KEY ("connected_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "github_repositories" ADD CONSTRAINT "github_repositories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "github_repositories" ADD CONSTRAINT "github_repositories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "github_repositories" ADD CONSTRAINT "github_repositories_github_installation_id_fkey" FOREIGN KEY ("github_installation_id") REFERENCES "github_installations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "github_repositories" ADD CONSTRAINT "github_repositories_connected_by_user_id_fkey" FOREIGN KEY ("connected_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "github_webhook_events" ADD CONSTRAINT "github_webhook_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "github_webhook_events" ADD CONSTRAINT "github_webhook_events_github_installation_id_fkey" FOREIGN KEY ("github_installation_id") REFERENCES "github_installations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "repository_scans" ADD CONSTRAINT "repository_scans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "repository_scans" ADD CONSTRAINT "repository_scans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "repository_scans" ADD CONSTRAINT "repository_scans_github_repository_id_fkey" FOREIGN KEY ("github_repository_id") REFERENCES "github_repositories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "repository_scans" ADD CONSTRAINT "repository_scans_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "repository_scans" ADD CONSTRAINT "repository_scans_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "repository_scans" ADD CONSTRAINT "repository_scans_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_github_repository_id_fkey" FOREIGN KEY ("github_repository_id") REFERENCES "github_repositories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cli_scan_events" ADD CONSTRAINT "cli_scan_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cli_scan_events" ADD CONSTRAINT "cli_scan_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cli_scan_events" ADD CONSTRAINT "cli_scan_events_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cli_scan_events" ADD CONSTRAINT "cli_scan_events_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cli_scan_events" ADD CONSTRAINT "cli_scan_events_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_github_repository_id_fkey" FOREIGN KEY ("github_repository_id") REFERENCES "github_repositories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
