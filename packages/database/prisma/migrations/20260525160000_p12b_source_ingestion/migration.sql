-- Phase P12B: safe source ingestion and real repository scan execution bridge.

CREATE TYPE "SourceArtifactStatus" AS ENUM ('QUEUED', 'INGESTING', 'STORED', 'FAILED', 'REJECTED', 'EXPIRED', 'DELETED');
CREATE TYPE "SourceOriginKind" AS ENUM ('GITHUB_APP_ARCHIVE', 'GITHUB_APP_CHECKOUT', 'CLI_UPLOAD', 'CI_UPLOAD', 'LOCAL_PATH_REFERENCE', 'MANUAL_UPLOAD');
CREATE TYPE "SourcePolicyStatus" AS ENUM ('ALLOWED', 'REJECTED', 'PARTIAL', 'NOT_ASSESSED');

ALTER TABLE "repository_scans" ADD COLUMN "source_artifact_id" UUID;

CREATE TABLE "source_artifacts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "github_repository_id" UUID,
  "scan_id" UUID,
  "provider" "RepositoryIntegrationProvider",
  "repo_owner" VARCHAR(160),
  "repo_name" VARCHAR(160),
  "repo_full_name" VARCHAR(320),
  "branch" VARCHAR(160),
  "commit_sha" VARCHAR(80),
  "pull_request_number" INTEGER,
  "origin_kind" "SourceOriginKind" NOT NULL,
  "status" "SourceArtifactStatus" NOT NULL DEFAULT 'QUEUED',
  "storage_key" TEXT,
  "archive_checksum" VARCHAR(128),
  "archive_size_bytes" BIGINT NOT NULL DEFAULT 0,
  "file_count" INTEGER NOT NULL DEFAULT 0,
  "total_size_bytes" BIGINT NOT NULL DEFAULT 0,
  "ignored_file_count" INTEGER NOT NULL DEFAULT 0,
  "rejected_file_count" INTEGER NOT NULL DEFAULT 0,
  "created_by_user_id" UUID,
  "expires_at" TIMESTAMP(3),
  "stored_at" TIMESTAMP(3),
  "deleted_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "source_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "source_manifests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "source_artifact_id" UUID NOT NULL,
  "manifest_checksum" VARCHAR(128) NOT NULL,
  "file_count" INTEGER NOT NULL DEFAULT 0,
  "total_size_bytes" BIGINT NOT NULL DEFAULT 0,
  "ignored_file_count" INTEGER NOT NULL DEFAULT 0,
  "rejected_file_count" INTEGER NOT NULL DEFAULT 0,
  "manifest" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "source_manifests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "source_file_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "source_artifact_id" UUID NOT NULL,
  "path" TEXT NOT NULL,
  "storage_key" TEXT,
  "checksum" VARCHAR(128),
  "size_bytes" BIGINT NOT NULL DEFAULT 0,
  "content_type" VARCHAR(120),
  "policy_status" "SourcePolicyStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  "ignored_reason" VARCHAR(160),
  "rejected_reason" VARCHAR(160),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "source_file_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "source_ingestion_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "github_repository_id" UUID,
  "source_artifact_id" UUID,
  "origin_kind" "SourceOriginKind" NOT NULL,
  "status" "SourceArtifactStatus" NOT NULL DEFAULT 'QUEUED',
  "error_category" VARCHAR(120),
  "created_by_user_id" UUID,
  "api_key_id" UUID,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "source_ingestion_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "source_ingestion_errors" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "source_artifact_id" UUID,
  "source_ingestion_run_id" UUID,
  "category" VARCHAR(120) NOT NULL,
  "file_path" TEXT,
  "safe_message" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "source_ingestion_errors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "repository_source_snapshots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "github_repository_id" UUID NOT NULL,
  "source_artifact_id" UUID NOT NULL,
  "branch" VARCHAR(160),
  "commit_sha" VARCHAR(80),
  "pull_request_number" INTEGER,
  "status" "SourceArtifactStatus" NOT NULL DEFAULT 'STORED',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "repository_source_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cli_source_uploads" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "source_artifact_id" UUID NOT NULL,
  "scan_id" UUID,
  "origin_kind" "SourceOriginKind" NOT NULL DEFAULT 'CLI_UPLOAD',
  "path_hash" VARCHAR(128),
  "requested_by_user_id" UUID,
  "api_key_id" UUID,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cli_source_uploads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "source_policy_decisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "source_artifact_id" UUID,
  "source_ingestion_run_id" UUID,
  "source_file_entry_id" UUID,
  "status" "SourcePolicyStatus" NOT NULL,
  "path" TEXT,
  "reason" VARCHAR(160) NOT NULL,
  "category" VARCHAR(120),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "source_policy_decisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "source_manifests_source_artifact_id_key" ON "source_manifests"("source_artifact_id");
CREATE INDEX "source_artifacts_organization_id_status_created_at_idx" ON "source_artifacts"("organization_id", "status", "created_at");
CREATE INDEX "source_artifacts_project_id_status_created_at_idx" ON "source_artifacts"("project_id", "status", "created_at");
CREATE INDEX "source_artifacts_github_repository_id_created_at_idx" ON "source_artifacts"("github_repository_id", "created_at");
CREATE INDEX "source_artifacts_scan_id_idx" ON "source_artifacts"("scan_id");
CREATE INDEX "source_manifests_organization_id_created_at_idx" ON "source_manifests"("organization_id", "created_at");
CREATE INDEX "source_file_entries_source_artifact_id_policy_status_idx" ON "source_file_entries"("source_artifact_id", "policy_status");
CREATE INDEX "source_file_entries_organization_id_created_at_idx" ON "source_file_entries"("organization_id", "created_at");
CREATE INDEX "source_ingestion_runs_organization_id_created_at_idx" ON "source_ingestion_runs"("organization_id", "created_at");
CREATE INDEX "source_ingestion_runs_github_repository_id_created_at_idx" ON "source_ingestion_runs"("github_repository_id", "created_at");
CREATE INDEX "source_ingestion_runs_source_artifact_id_idx" ON "source_ingestion_runs"("source_artifact_id");
CREATE INDEX "source_ingestion_errors_organization_id_created_at_idx" ON "source_ingestion_errors"("organization_id", "created_at");
CREATE INDEX "source_ingestion_errors_source_ingestion_run_id_idx" ON "source_ingestion_errors"("source_ingestion_run_id");
CREATE INDEX "repository_source_snapshots_github_repository_id_created_at_idx" ON "repository_source_snapshots"("github_repository_id", "created_at");
CREATE INDEX "repository_source_snapshots_source_artifact_id_idx" ON "repository_source_snapshots"("source_artifact_id");
CREATE INDEX "cli_source_uploads_organization_id_created_at_idx" ON "cli_source_uploads"("organization_id", "created_at");
CREATE INDEX "cli_source_uploads_source_artifact_id_idx" ON "cli_source_uploads"("source_artifact_id");
CREATE INDEX "cli_source_uploads_scan_id_idx" ON "cli_source_uploads"("scan_id");
CREATE INDEX "source_policy_decisions_organization_id_created_at_idx" ON "source_policy_decisions"("organization_id", "created_at");
CREATE INDEX "source_policy_decisions_source_artifact_id_status_idx" ON "source_policy_decisions"("source_artifact_id", "status");
CREATE INDEX "source_policy_decisions_source_ingestion_run_id_idx" ON "source_policy_decisions"("source_ingestion_run_id");
CREATE INDEX "repository_scans_source_artifact_id_idx" ON "repository_scans"("source_artifact_id");

ALTER TABLE "source_artifacts" ADD CONSTRAINT "source_artifacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_artifacts" ADD CONSTRAINT "source_artifacts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "source_artifacts" ADD CONSTRAINT "source_artifacts_github_repository_id_fkey" FOREIGN KEY ("github_repository_id") REFERENCES "github_repositories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "source_artifacts" ADD CONSTRAINT "source_artifacts_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "source_artifacts" ADD CONSTRAINT "source_artifacts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "source_manifests" ADD CONSTRAINT "source_manifests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_manifests" ADD CONSTRAINT "source_manifests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "source_manifests" ADD CONSTRAINT "source_manifests_source_artifact_id_fkey" FOREIGN KEY ("source_artifact_id") REFERENCES "source_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "source_file_entries" ADD CONSTRAINT "source_file_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_file_entries" ADD CONSTRAINT "source_file_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "source_file_entries" ADD CONSTRAINT "source_file_entries_source_artifact_id_fkey" FOREIGN KEY ("source_artifact_id") REFERENCES "source_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "source_ingestion_runs" ADD CONSTRAINT "source_ingestion_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_ingestion_runs" ADD CONSTRAINT "source_ingestion_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "source_ingestion_runs" ADD CONSTRAINT "source_ingestion_runs_github_repository_id_fkey" FOREIGN KEY ("github_repository_id") REFERENCES "github_repositories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "source_ingestion_runs" ADD CONSTRAINT "source_ingestion_runs_source_artifact_id_fkey" FOREIGN KEY ("source_artifact_id") REFERENCES "source_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "source_ingestion_runs" ADD CONSTRAINT "source_ingestion_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "source_ingestion_runs" ADD CONSTRAINT "source_ingestion_runs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "source_ingestion_errors" ADD CONSTRAINT "source_ingestion_errors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_ingestion_errors" ADD CONSTRAINT "source_ingestion_errors_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "source_ingestion_errors" ADD CONSTRAINT "source_ingestion_errors_source_artifact_id_fkey" FOREIGN KEY ("source_artifact_id") REFERENCES "source_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_ingestion_errors" ADD CONSTRAINT "source_ingestion_errors_source_ingestion_run_id_fkey" FOREIGN KEY ("source_ingestion_run_id") REFERENCES "source_ingestion_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "repository_source_snapshots" ADD CONSTRAINT "repository_source_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "repository_source_snapshots" ADD CONSTRAINT "repository_source_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "repository_source_snapshots" ADD CONSTRAINT "repository_source_snapshots_github_repository_id_fkey" FOREIGN KEY ("github_repository_id") REFERENCES "github_repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "repository_source_snapshots" ADD CONSTRAINT "repository_source_snapshots_source_artifact_id_fkey" FOREIGN KEY ("source_artifact_id") REFERENCES "source_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cli_source_uploads" ADD CONSTRAINT "cli_source_uploads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cli_source_uploads" ADD CONSTRAINT "cli_source_uploads_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cli_source_uploads" ADD CONSTRAINT "cli_source_uploads_source_artifact_id_fkey" FOREIGN KEY ("source_artifact_id") REFERENCES "source_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cli_source_uploads" ADD CONSTRAINT "cli_source_uploads_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cli_source_uploads" ADD CONSTRAINT "cli_source_uploads_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cli_source_uploads" ADD CONSTRAINT "cli_source_uploads_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "source_policy_decisions" ADD CONSTRAINT "source_policy_decisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_policy_decisions" ADD CONSTRAINT "source_policy_decisions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "source_policy_decisions" ADD CONSTRAINT "source_policy_decisions_source_artifact_id_fkey" FOREIGN KEY ("source_artifact_id") REFERENCES "source_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_policy_decisions" ADD CONSTRAINT "source_policy_decisions_source_ingestion_run_id_fkey" FOREIGN KEY ("source_ingestion_run_id") REFERENCES "source_ingestion_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_policy_decisions" ADD CONSTRAINT "source_policy_decisions_source_file_entry_id_fkey" FOREIGN KEY ("source_file_entry_id") REFERENCES "source_file_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "repository_scans" ADD CONSTRAINT "repository_scans_source_artifact_id_fkey" FOREIGN KEY ("source_artifact_id") REFERENCES "source_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
