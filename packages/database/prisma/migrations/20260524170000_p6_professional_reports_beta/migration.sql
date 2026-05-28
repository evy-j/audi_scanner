-- P6 professional reports, export center, share links, and beta usage limits.

CREATE TYPE "ReportStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'REVOKED');
CREATE TYPE "ReportExportFormat" AS ENUM ('HTML', 'PDF', 'JSON', 'SARIF', 'MARKDOWN');
CREATE TYPE "PlanTier" AS ENUM ('FREE_BETA', 'DEVELOPER', 'TEAM', 'ENTERPRISE');
CREATE TYPE "UsageMetric" AS ENUM (
  'SCANS_PER_MONTH',
  'AI_VALIDATIONS_PER_MONTH',
  'REMEDIATION_RUNS_PER_MONTH',
  'REPORT_EXPORTS_PER_MONTH',
  'MONITORED_PROJECTS'
);

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REPORT_EXPORT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REPORT_SHARE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REPORT_REVOKE';
ALTER TYPE "AuditResource" ADD VALUE IF NOT EXISTS 'REPORT';
ALTER TYPE "AuditResource" ADD VALUE IF NOT EXISTS 'REPORT_EXPORT';
ALTER TYPE "AuditResource" ADD VALUE IF NOT EXISTS 'REPORT_SHARE_LINK';
ALTER TYPE "AuditResource" ADD VALUE IF NOT EXISTS 'USAGE_COUNTER';

CREATE TABLE "reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "created_by_user_id" UUID,
  "report_number" VARCHAR(80) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "ReportStatus" NOT NULL DEFAULT 'QUEUED',
  "title" VARCHAR(220) NOT NULL,
  "executive_summary" TEXT,
  "risk_score" DECIMAL(5, 2) NOT NULL DEFAULT 0,
  "include_suppressed" BOOLEAN NOT NULL DEFAULT false,
  "html_artifact_path" TEXT,
  "markdown_artifact_path" TEXT,
  "json_artifact_path" TEXT,
  "checksum_sha256" VARCHAR(128),
  "generated_at" TIMESTAMP(3),
  "published_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_sections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "report_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "section_key" VARCHAR(120) NOT NULL,
  "title" VARCHAR(220) NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "checksum_sha256" VARCHAR(128) NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "report_sections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_exports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "report_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "requested_by_user_id" UUID,
  "format" "ReportExportFormat" NOT NULL,
  "status" "ReportStatus" NOT NULL DEFAULT 'QUEUED',
  "artifact_path" TEXT,
  "checksum_sha256" VARCHAR(128),
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "error_category" VARCHAR(120),
  "error" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_share_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "report_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "created_by_user_id" UUID,
  "share_token_hash" VARCHAR(128) NOT NULL,
  "token_prefix" VARCHAR(16) NOT NULL,
  "include_suppressed" BOOLEAN NOT NULL DEFAULT false,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "last_accessed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "report_share_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_disclaimers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "report_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "version" VARCHAR(80) NOT NULL,
  "text" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "report_disclaimers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_generation_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "report_id" UUID,
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "requested_by_user_id" UUID,
  "status" "ReportStatus" NOT NULL DEFAULT 'QUEUED',
  "input_data_checksum" VARCHAR(128),
  "output_artifact_path" TEXT,
  "output_artifact_checksum_sha256" VARCHAR(128),
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "error_category" VARCHAR(120),
  "error" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "report_generation_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "tier" "PlanTier" NOT NULL DEFAULT 'FREE_BETA',
  "name" VARCHAR(120) NOT NULL,
  "scans_per_month" INTEGER NOT NULL DEFAULT 25,
  "ai_validations_per_month" INTEGER NOT NULL DEFAULT 50,
  "remediation_runs_per_month" INTEGER NOT NULL DEFAULT 25,
  "report_exports_per_month" INTEGER NOT NULL DEFAULT 25,
  "monitored_projects" INTEGER NOT NULL DEFAULT 3,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "usage_counters" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "plan_id" UUID,
  "metric" "UsageMetric" NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "used" INTEGER NOT NULL DEFAULT 0,
  "limit" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "usage_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "plan_id" UUID,
  "metric" "UsageMetric" NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "resource_type" VARCHAR(80),
  "resource_id" VARCHAR(128),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "subscriptions" ADD COLUMN "plan_id" UUID;

CREATE UNIQUE INDEX "reports_report_number_key" ON "reports"("report_number");
CREATE UNIQUE INDEX "reports_scan_id_version_key" ON "reports"("scan_id", "version");
CREATE INDEX "reports_organization_id_status_created_at_idx" ON "reports"("organization_id", "status", "created_at");
CREATE INDEX "reports_organization_id_scan_id_status_created_at_idx" ON "reports"("organization_id", "scan_id", "status", "created_at");

CREATE UNIQUE INDEX "report_sections_report_id_section_key_key" ON "report_sections"("report_id", "section_key");
CREATE INDEX "report_sections_scan_id_sort_order_idx" ON "report_sections"("scan_id", "sort_order");

CREATE INDEX "report_exports_report_id_format_created_at_idx" ON "report_exports"("report_id", "format", "created_at");
CREATE INDEX "report_exports_organization_id_format_created_at_idx" ON "report_exports"("organization_id", "format", "created_at");

CREATE UNIQUE INDEX "report_share_links_share_token_hash_key" ON "report_share_links"("share_token_hash");
CREATE INDEX "report_share_links_report_id_revoked_at_expires_at_idx" ON "report_share_links"("report_id", "revoked_at", "expires_at");
CREATE INDEX "report_share_links_organization_id_created_at_idx" ON "report_share_links"("organization_id", "created_at");

CREATE INDEX "report_disclaimers_report_id_created_at_idx" ON "report_disclaimers"("report_id", "created_at");

CREATE INDEX "report_generation_runs_scan_id_status_created_at_idx" ON "report_generation_runs"("scan_id", "status", "created_at");
CREATE INDEX "report_generation_runs_report_id_created_at_idx" ON "report_generation_runs"("report_id", "created_at");

CREATE INDEX "plans_organization_id_tier_active_idx" ON "plans"("organization_id", "tier", "active");
CREATE UNIQUE INDEX "usage_counters_organization_id_metric_period_start_key" ON "usage_counters"("organization_id", "metric", "period_start");
CREATE INDEX "usage_counters_organization_id_period_start_period_end_idx" ON "usage_counters"("organization_id", "period_start", "period_end");
CREATE INDEX "usage_events_organization_id_metric_created_at_idx" ON "usage_events"("organization_id", "metric", "created_at");
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");

ALTER TABLE "reports" ADD CONSTRAINT "reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_sections" ADD CONSTRAINT "report_sections_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_sections" ADD CONSTRAINT "report_sections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_sections" ADD CONSTRAINT "report_sections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_sections" ADD CONSTRAINT "report_sections_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_share_links" ADD CONSTRAINT "report_share_links_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_share_links" ADD CONSTRAINT "report_share_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_share_links" ADD CONSTRAINT "report_share_links_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_share_links" ADD CONSTRAINT "report_share_links_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_disclaimers" ADD CONSTRAINT "report_disclaimers_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_disclaimers" ADD CONSTRAINT "report_disclaimers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_disclaimers" ADD CONSTRAINT "report_disclaimers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_disclaimers" ADD CONSTRAINT "report_disclaimers_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_generation_runs" ADD CONSTRAINT "report_generation_runs_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_generation_runs" ADD CONSTRAINT "report_generation_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_generation_runs" ADD CONSTRAINT "report_generation_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_generation_runs" ADD CONSTRAINT "report_generation_runs_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "plans" ADD CONSTRAINT "plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
