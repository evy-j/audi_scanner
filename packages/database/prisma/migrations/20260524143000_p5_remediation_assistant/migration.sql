-- P5 remediation assistant with human-reviewed secure diff suggestions.

CREATE TYPE "RemediationStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'TIMEOUT',
  'PROVIDER_NOT_CONFIGURED',
  'NOT_ELIGIBLE',
  'NOT_ASSESSED'
);

CREATE TYPE "RemediationKind" AS ENUM (
  'GUIDANCE',
  'SECURE_DIFF_SUGGESTION',
  'TEST_SUGGESTION',
  'REGRESSION_CHECKLIST'
);

CREATE TYPE "PatchSafetyStatus" AS ENUM (
  'SAFE_TO_REVIEW',
  'NEEDS_HUMAN_REVIEW',
  'BEHAVIOR_CHANGING',
  'UNSAFE',
  'NOT_ASSESSED'
);

CREATE TABLE "remediation_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "provider" VARCHAR(40) NOT NULL,
  "model" VARCHAR(160),
  "prompt_version" VARCHAR(80) NOT NULL,
  "status" "RemediationStatus" NOT NULL DEFAULT 'QUEUED',
  "kind" "RemediationKind" NOT NULL DEFAULT 'GUIDANCE',
  "safety_status" "PatchSafetyStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  "input_artifact_path" TEXT,
  "input_evidence_checksum" VARCHAR(128),
  "output_artifact_path" TEXT,
  "output_artifact_checksum_sha256" VARCHAR(128),
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "duration_ms" INTEGER,
  "error_category" VARCHAR(120),
  "error" TEXT,
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "total_tokens" INTEGER,
  "cost_estimate" DECIMAL(12, 6),
  "currency" VARCHAR(8),
  "reviewed_at" TIMESTAMP(3),
  "reviewed_by_user_id" UUID,
  "rejected_at" TIMESTAMP(3),
  "rejected_by_user_id" UUID,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "remediation_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "remediation_suggestions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "remediation_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "kind" "RemediationKind" NOT NULL,
  "safety_status" "PatchSafetyStatus" NOT NULL DEFAULT 'NEEDS_HUMAN_REVIEW',
  "title" VARCHAR(240) NOT NULL,
  "body" TEXT NOT NULL,
  "behavior_change_notes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "limitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "requires_human_review" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "remediation_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "remediation_diffs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "remediation_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "safety_status" "PatchSafetyStatus" NOT NULL DEFAULT 'NEEDS_HUMAN_REVIEW',
  "file_path" TEXT NOT NULL,
  "original_start_line" INTEGER,
  "original_end_line" INTEGER,
  "original_start_column" INTEGER,
  "original_end_column" INTEGER,
  "proposed_patch" TEXT NOT NULL,
  "explanation" TEXT NOT NULL,
  "risk" TEXT NOT NULL,
  "behavior_change_notes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "requires_human_review" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "remediation_diffs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "remediation_test_suggestions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "remediation_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "kind" "RemediationKind" NOT NULL DEFAULT 'TEST_SUGGESTION',
  "title" VARCHAR(240) NOT NULL,
  "test_framework" VARCHAR(80),
  "description" TEXT NOT NULL,
  "skeleton" TEXT,
  "expected_failing_before" TEXT,
  "expected_fixed_after" TEXT,
  "requires_human_review" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "remediation_test_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "remediation_checklist_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "remediation_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "kind" "RemediationKind" NOT NULL DEFAULT 'REGRESSION_CHECKLIST',
  "item" TEXT NOT NULL,
  "requires_human_review" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "remediation_checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "remediation_review_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "remediation_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "action" VARCHAR(80) NOT NULL,
  "previous_value" JSONB,
  "new_value" JSONB,
  "comment" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "remediation_review_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "remediation_runs_finding_id_created_at_idx" ON "remediation_runs"("finding_id", "created_at");
CREATE INDEX "remediation_runs_scan_id_status_created_at_idx" ON "remediation_runs"("scan_id", "status", "created_at");
CREATE INDEX "remediation_runs_organization_id_status_created_at_idx" ON "remediation_runs"("organization_id", "status", "created_at");

CREATE INDEX "remediation_suggestions_finding_id_kind_created_at_idx" ON "remediation_suggestions"("finding_id", "kind", "created_at");
CREATE INDEX "remediation_suggestions_remediation_run_id_kind_idx" ON "remediation_suggestions"("remediation_run_id", "kind");

CREATE INDEX "remediation_diffs_finding_id_created_at_idx" ON "remediation_diffs"("finding_id", "created_at");
CREATE INDEX "remediation_diffs_remediation_run_id_idx" ON "remediation_diffs"("remediation_run_id");

CREATE INDEX "remediation_test_suggestions_finding_id_created_at_idx" ON "remediation_test_suggestions"("finding_id", "created_at");
CREATE INDEX "remediation_test_suggestions_remediation_run_id_idx" ON "remediation_test_suggestions"("remediation_run_id");

CREATE INDEX "remediation_checklist_items_finding_id_created_at_idx" ON "remediation_checklist_items"("finding_id", "created_at");
CREATE INDEX "remediation_checklist_items_remediation_run_id_idx" ON "remediation_checklist_items"("remediation_run_id");

CREATE INDEX "remediation_review_events_remediation_run_id_created_at_idx" ON "remediation_review_events"("remediation_run_id", "created_at");
CREATE INDEX "remediation_review_events_finding_id_created_at_idx" ON "remediation_review_events"("finding_id", "created_at");

ALTER TABLE "remediation_runs" ADD CONSTRAINT "remediation_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "remediation_runs" ADD CONSTRAINT "remediation_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "remediation_runs" ADD CONSTRAINT "remediation_runs_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "remediation_runs" ADD CONSTRAINT "remediation_runs_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "remediation_suggestions" ADD CONSTRAINT "remediation_suggestions_remediation_run_id_fkey" FOREIGN KEY ("remediation_run_id") REFERENCES "remediation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "remediation_suggestions" ADD CONSTRAINT "remediation_suggestions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "remediation_suggestions" ADD CONSTRAINT "remediation_suggestions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "remediation_suggestions" ADD CONSTRAINT "remediation_suggestions_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "remediation_suggestions" ADD CONSTRAINT "remediation_suggestions_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "remediation_diffs" ADD CONSTRAINT "remediation_diffs_remediation_run_id_fkey" FOREIGN KEY ("remediation_run_id") REFERENCES "remediation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "remediation_diffs" ADD CONSTRAINT "remediation_diffs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "remediation_diffs" ADD CONSTRAINT "remediation_diffs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "remediation_diffs" ADD CONSTRAINT "remediation_diffs_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "remediation_diffs" ADD CONSTRAINT "remediation_diffs_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "remediation_test_suggestions" ADD CONSTRAINT "remediation_test_suggestions_remediation_run_id_fkey" FOREIGN KEY ("remediation_run_id") REFERENCES "remediation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "remediation_test_suggestions" ADD CONSTRAINT "remediation_test_suggestions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "remediation_test_suggestions" ADD CONSTRAINT "remediation_test_suggestions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "remediation_test_suggestions" ADD CONSTRAINT "remediation_test_suggestions_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "remediation_test_suggestions" ADD CONSTRAINT "remediation_test_suggestions_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "remediation_checklist_items" ADD CONSTRAINT "remediation_checklist_items_remediation_run_id_fkey" FOREIGN KEY ("remediation_run_id") REFERENCES "remediation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "remediation_checklist_items" ADD CONSTRAINT "remediation_checklist_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "remediation_checklist_items" ADD CONSTRAINT "remediation_checklist_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "remediation_checklist_items" ADD CONSTRAINT "remediation_checklist_items_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "remediation_checklist_items" ADD CONSTRAINT "remediation_checklist_items_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "remediation_review_events" ADD CONSTRAINT "remediation_review_events_remediation_run_id_fkey" FOREIGN KEY ("remediation_run_id") REFERENCES "remediation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "remediation_review_events" ADD CONSTRAINT "remediation_review_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "remediation_review_events" ADD CONSTRAINT "remediation_review_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "remediation_review_events" ADD CONSTRAINT "remediation_review_events_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "remediation_review_events" ADD CONSTRAINT "remediation_review_events_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
