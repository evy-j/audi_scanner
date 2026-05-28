-- P4 AI evidence validator layer. AI outputs are stored separately from findings.

CREATE TYPE "AiValidationStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'TIMEOUT',
  'PROVIDER_NOT_CONFIGURED',
  'NOT_ASSESSED'
);

CREATE TYPE "AiValidationDecision" AS ENUM (
  'EVIDENCE_STRONG',
  'EVIDENCE_MEDIUM',
  'EVIDENCE_WEAK',
  'LIKELY_FALSE_POSITIVE',
  'NEEDS_HUMAN_REVIEW',
  'CONTRADICTED',
  'NOT_ENOUGH_EVIDENCE'
);

CREATE TYPE "AiValidationScope" AS ENUM (
  'FINDING',
  'SCAN_SUMMARY',
  'REVIEW_ASSIST',
  'REMEDIATION_EXPLANATION'
);

CREATE TABLE "ai_validation_runs" (
  "id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID,
  "provider" VARCHAR(40) NOT NULL,
  "model" VARCHAR(160),
  "prompt_version" VARCHAR(80) NOT NULL,
  "scope" "AiValidationScope" NOT NULL,
  "status" "AiValidationStatus" NOT NULL DEFAULT 'QUEUED',
  "decision" "AiValidationDecision",
  "confidence_adjustment_suggestion" DECIMAL(5,2),
  "false_positive_risk" INTEGER,
  "evidence_coverage_score" INTEGER,
  "hallucination_risk" INTEGER,
  "input_artifact_key" TEXT,
  "input_artifact_checksum" VARCHAR(128),
  "output_artifact_path" TEXT,
  "output_artifact_checksum_sha256" VARCHAR(128),
  "started_at" TIMESTAMP(3) NOT NULL,
  "finished_at" TIMESTAMP(3),
  "duration_ms" INTEGER,
  "error_category" VARCHAR(120),
  "error" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_validation_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_finding_validations" (
  "id" UUID NOT NULL,
  "ai_validation_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "decision" "AiValidationDecision" NOT NULL,
  "reasoning_summary" TEXT NOT NULL,
  "evidence_ids_used" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "missing_evidence" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "contradiction_notes" TEXT,
  "suggested_review_status" "FindingReviewStatus",
  "confidence_adjustment_suggestion" DECIMAL(5,2),
  "false_positive_risk" INTEGER NOT NULL DEFAULT 0,
  "evidence_coverage_score" INTEGER NOT NULL DEFAULT 0,
  "hallucination_risk" INTEGER NOT NULL DEFAULT 0,
  "human_reviewer_checklist" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "remediation_explanation" TEXT,
  "raw_output" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_finding_validations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_evidence_critiques" (
  "id" UUID NOT NULL,
  "ai_validation_run_id" UUID NOT NULL,
  "ai_finding_validation_id" UUID,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID,
  "finding_evidence_id" UUID,
  "source_range_id" UUID,
  "evidence_reference" VARCHAR(160),
  "support_level" VARCHAR(80),
  "critique" TEXT NOT NULL,
  "missing_context" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_evidence_critiques_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_review_notes" (
  "id" UUID NOT NULL,
  "ai_validation_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID,
  "scope" "AiValidationScope" NOT NULL,
  "note_type" VARCHAR(80) NOT NULL,
  "title" VARCHAR(240),
  "body" TEXT NOT NULL,
  "evidence_ids_used" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_review_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_provider_usage" (
  "id" UUID NOT NULL,
  "ai_validation_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID,
  "provider" VARCHAR(40) NOT NULL,
  "model" VARCHAR(160),
  "prompt_version" VARCHAR(80) NOT NULL,
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "total_tokens" INTEGER,
  "cost_estimate" DECIMAL(12,6),
  "currency" VARCHAR(8),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_provider_usage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_validation_runs_scan_id_scope_status_started_at_idx" ON "ai_validation_runs"("scan_id", "scope", "status", "started_at");
CREATE INDEX "ai_validation_runs_finding_id_scope_started_at_idx" ON "ai_validation_runs"("finding_id", "scope", "started_at");
CREATE INDEX "ai_validation_runs_organization_id_status_started_at_idx" ON "ai_validation_runs"("organization_id", "status", "started_at");

CREATE UNIQUE INDEX "ai_finding_validations_ai_validation_run_id_key" ON "ai_finding_validations"("ai_validation_run_id");
CREATE INDEX "ai_finding_validations_finding_id_created_at_idx" ON "ai_finding_validations"("finding_id", "created_at");
CREATE INDEX "ai_finding_validations_scan_id_decision_created_at_idx" ON "ai_finding_validations"("scan_id", "decision", "created_at");

CREATE INDEX "ai_evidence_critiques_finding_id_created_at_idx" ON "ai_evidence_critiques"("finding_id", "created_at");
CREATE INDEX "ai_evidence_critiques_finding_evidence_id_idx" ON "ai_evidence_critiques"("finding_evidence_id");
CREATE INDEX "ai_evidence_critiques_scan_id_created_at_idx" ON "ai_evidence_critiques"("scan_id", "created_at");

CREATE INDEX "ai_review_notes_scan_id_scope_created_at_idx" ON "ai_review_notes"("scan_id", "scope", "created_at");
CREATE INDEX "ai_review_notes_finding_id_created_at_idx" ON "ai_review_notes"("finding_id", "created_at");

CREATE INDEX "ai_provider_usage_scan_id_provider_created_at_idx" ON "ai_provider_usage"("scan_id", "provider", "created_at");
CREATE INDEX "ai_provider_usage_finding_id_created_at_idx" ON "ai_provider_usage"("finding_id", "created_at");

ALTER TABLE "ai_validation_runs" ADD CONSTRAINT "ai_validation_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_validation_runs" ADD CONSTRAINT "ai_validation_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_validation_runs" ADD CONSTRAINT "ai_validation_runs_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_validation_runs" ADD CONSTRAINT "ai_validation_runs_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_finding_validations" ADD CONSTRAINT "ai_finding_validations_ai_validation_run_id_fkey" FOREIGN KEY ("ai_validation_run_id") REFERENCES "ai_validation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_finding_validations" ADD CONSTRAINT "ai_finding_validations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_finding_validations" ADD CONSTRAINT "ai_finding_validations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_finding_validations" ADD CONSTRAINT "ai_finding_validations_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_finding_validations" ADD CONSTRAINT "ai_finding_validations_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_evidence_critiques" ADD CONSTRAINT "ai_evidence_critiques_ai_validation_run_id_fkey" FOREIGN KEY ("ai_validation_run_id") REFERENCES "ai_validation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_evidence_critiques" ADD CONSTRAINT "ai_evidence_critiques_ai_finding_validation_id_fkey" FOREIGN KEY ("ai_finding_validation_id") REFERENCES "ai_finding_validations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_evidence_critiques" ADD CONSTRAINT "ai_evidence_critiques_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_evidence_critiques" ADD CONSTRAINT "ai_evidence_critiques_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_evidence_critiques" ADD CONSTRAINT "ai_evidence_critiques_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_evidence_critiques" ADD CONSTRAINT "ai_evidence_critiques_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_evidence_critiques" ADD CONSTRAINT "ai_evidence_critiques_finding_evidence_id_fkey" FOREIGN KEY ("finding_evidence_id") REFERENCES "finding_evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_evidence_critiques" ADD CONSTRAINT "ai_evidence_critiques_source_range_id_fkey" FOREIGN KEY ("source_range_id") REFERENCES "source_ranges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_review_notes" ADD CONSTRAINT "ai_review_notes_ai_validation_run_id_fkey" FOREIGN KEY ("ai_validation_run_id") REFERENCES "ai_validation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_review_notes" ADD CONSTRAINT "ai_review_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_review_notes" ADD CONSTRAINT "ai_review_notes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_review_notes" ADD CONSTRAINT "ai_review_notes_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_review_notes" ADD CONSTRAINT "ai_review_notes_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_provider_usage" ADD CONSTRAINT "ai_provider_usage_ai_validation_run_id_fkey" FOREIGN KEY ("ai_validation_run_id") REFERENCES "ai_validation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_provider_usage" ADD CONSTRAINT "ai_provider_usage_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_provider_usage" ADD CONSTRAINT "ai_provider_usage_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_provider_usage" ADD CONSTRAINT "ai_provider_usage_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_provider_usage" ADD CONSTRAINT "ai_provider_usage_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
