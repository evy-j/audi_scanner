-- Phase P8: safe local fuzzing and invariant testing persistence.

CREATE TYPE "FuzzRunStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'PASSED',
  'FAILED',
  'TIMEOUT',
  'TOOL_NOT_INSTALLED',
  'NOT_ASSESSED',
  'NOT_ELIGIBLE',
  'INCONCLUSIVE'
);

CREATE TYPE "FuzzToolKind" AS ENUM (
  'FOUNDRY',
  'ECHIDNA',
  'MEDUSA',
  'HARDHAT',
  'UNKNOWN'
);

CREATE TYPE "InvariantStatus" AS ENUM (
  'PASSED',
  'FAILED',
  'INCONCLUSIVE',
  'NOT_ASSESSED'
);

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'FUZZ_RUN';
ALTER TYPE "AuditResource" ADD VALUE IF NOT EXISTS 'FUZZ_RUN';
ALTER TYPE "AuditResource" ADD VALUE IF NOT EXISTS 'INVARIANT';

CREATE TABLE "fuzz_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID,
  "tool_kind" "FuzzToolKind" NOT NULL DEFAULT 'UNKNOWN',
  "status" "FuzzRunStatus" NOT NULL DEFAULT 'QUEUED',
  "safety_level" VARCHAR(40) NOT NULL DEFAULT 'LOCAL_ONLY',
  "command_executed" TEXT,
  "input_context_checksum" VARCHAR(128),
  "stdout_artifact_path" TEXT,
  "stdout_checksum_sha256" VARCHAR(128),
  "stderr_artifact_path" TEXT,
  "stderr_checksum_sha256" VARCHAR(128),
  "counterexample_artifact_path" TEXT,
  "counterexample_checksum_sha256" VARCHAR(128),
  "coverage_data" JSONB,
  "invariant_status" "InvariantStatus",
  "gas_used" BIGINT,
  "error_category" VARCHAR(120),
  "error" TEXT,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "duration_ms" INTEGER,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fuzz_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fuzz_targets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "fuzz_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID,
  "target_type" VARCHAR(80) NOT NULL,
  "contract_name" VARCHAR(180),
  "function_name" VARCHAR(180),
  "file_path" TEXT,
  "source_range" JSONB,
  "abi_artifact_path" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fuzz_targets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fuzz_test_cases" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "fuzz_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID,
  "title" VARCHAR(240) NOT NULL,
  "framework" "FuzzToolKind" NOT NULL DEFAULT 'FOUNDRY',
  "body" TEXT,
  "skeleton" TEXT,
  "generated_only" BOOLEAN NOT NULL DEFAULT true,
  "status" "FuzzRunStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  "command_preview" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fuzz_test_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fuzz_counterexamples" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "fuzz_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID,
  "summary" TEXT NOT NULL,
  "artifact_path" TEXT,
  "checksum_sha256" VARCHAR(128),
  "raw_excerpt" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fuzz_counterexamples_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invariant_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "fuzz_run_id" UUID,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID,
  "tool_kind" "FuzzToolKind" NOT NULL DEFAULT 'FOUNDRY',
  "status" "InvariantStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  "command_executed" TEXT,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "duration_ms" INTEGER,
  "error_category" VARCHAR(120),
  "error" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invariant_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invariant_definitions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "fuzz_run_id" UUID,
  "invariant_run_id" UUID,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID,
  "category" VARCHAR(120) NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "description" TEXT NOT NULL,
  "expression" TEXT,
  "skeleton" TEXT,
  "source" VARCHAR(80) NOT NULL DEFAULT 'PERSISTED_CONTEXT',
  "status" "InvariantStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invariant_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invariant_results" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "fuzz_run_id" UUID,
  "invariant_run_id" UUID,
  "definition_id" UUID,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID,
  "status" "InvariantStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  "summary" TEXT NOT NULL,
  "counterexample_artifact_path" TEXT,
  "counterexample_checksum_sha256" VARCHAR(128),
  "gas_used" BIGINT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invariant_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coverage_summaries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "fuzz_run_id" UUID,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID,
  "tool_kind" "FuzzToolKind" NOT NULL DEFAULT 'FOUNDRY',
  "status" "InvariantStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  "line_coverage_pct" DECIMAL(5,2),
  "function_coverage_pct" DECIMAL(5,2),
  "branch_coverage_pct" DECIMAL(5,2),
  "artifact_path" TEXT,
  "checksum_sha256" VARCHAR(128),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coverage_summaries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fuzz_artifacts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "fuzz_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID,
  "artifact_type" VARCHAR(80) NOT NULL,
  "artifact_path" TEXT NOT NULL,
  "checksum_sha256" VARCHAR(128) NOT NULL,
  "size_bytes" INTEGER,
  "redacted" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fuzz_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fuzz_runs_scan_id_status_created_at_idx" ON "fuzz_runs"("scan_id", "status", "created_at");
CREATE INDEX "fuzz_runs_finding_id_status_created_at_idx" ON "fuzz_runs"("finding_id", "status", "created_at");
CREATE INDEX "fuzz_runs_organization_id_status_created_at_idx" ON "fuzz_runs"("organization_id", "status", "created_at");
CREATE INDEX "fuzz_targets_fuzz_run_id_target_type_idx" ON "fuzz_targets"("fuzz_run_id", "target_type");
CREATE INDEX "fuzz_targets_scan_id_target_type_idx" ON "fuzz_targets"("scan_id", "target_type");
CREATE INDEX "fuzz_test_cases_fuzz_run_id_status_idx" ON "fuzz_test_cases"("fuzz_run_id", "status");
CREATE INDEX "fuzz_test_cases_scan_id_created_at_idx" ON "fuzz_test_cases"("scan_id", "created_at");
CREATE INDEX "fuzz_counterexamples_fuzz_run_id_created_at_idx" ON "fuzz_counterexamples"("fuzz_run_id", "created_at");
CREATE INDEX "invariant_runs_scan_id_status_created_at_idx" ON "invariant_runs"("scan_id", "status", "created_at");
CREATE INDEX "invariant_runs_fuzz_run_id_created_at_idx" ON "invariant_runs"("fuzz_run_id", "created_at");
CREATE INDEX "invariant_definitions_scan_id_category_created_at_idx" ON "invariant_definitions"("scan_id", "category", "created_at");
CREATE INDEX "invariant_definitions_fuzz_run_id_created_at_idx" ON "invariant_definitions"("fuzz_run_id", "created_at");
CREATE INDEX "invariant_results_scan_id_status_created_at_idx" ON "invariant_results"("scan_id", "status", "created_at");
CREATE INDEX "invariant_results_fuzz_run_id_created_at_idx" ON "invariant_results"("fuzz_run_id", "created_at");
CREATE INDEX "coverage_summaries_scan_id_created_at_idx" ON "coverage_summaries"("scan_id", "created_at");
CREATE INDEX "coverage_summaries_fuzz_run_id_created_at_idx" ON "coverage_summaries"("fuzz_run_id", "created_at");
CREATE INDEX "fuzz_artifacts_fuzz_run_id_artifact_type_idx" ON "fuzz_artifacts"("fuzz_run_id", "artifact_type");
CREATE INDEX "fuzz_artifacts_scan_id_created_at_idx" ON "fuzz_artifacts"("scan_id", "created_at");

ALTER TABLE "fuzz_runs" ADD CONSTRAINT "fuzz_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fuzz_runs" ADD CONSTRAINT "fuzz_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fuzz_runs" ADD CONSTRAINT "fuzz_runs_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fuzz_runs" ADD CONSTRAINT "fuzz_runs_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fuzz_targets" ADD CONSTRAINT "fuzz_targets_fuzz_run_id_fkey" FOREIGN KEY ("fuzz_run_id") REFERENCES "fuzz_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fuzz_targets" ADD CONSTRAINT "fuzz_targets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fuzz_targets" ADD CONSTRAINT "fuzz_targets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fuzz_targets" ADD CONSTRAINT "fuzz_targets_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fuzz_targets" ADD CONSTRAINT "fuzz_targets_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fuzz_test_cases" ADD CONSTRAINT "fuzz_test_cases_fuzz_run_id_fkey" FOREIGN KEY ("fuzz_run_id") REFERENCES "fuzz_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fuzz_test_cases" ADD CONSTRAINT "fuzz_test_cases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fuzz_test_cases" ADD CONSTRAINT "fuzz_test_cases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fuzz_test_cases" ADD CONSTRAINT "fuzz_test_cases_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fuzz_test_cases" ADD CONSTRAINT "fuzz_test_cases_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fuzz_counterexamples" ADD CONSTRAINT "fuzz_counterexamples_fuzz_run_id_fkey" FOREIGN KEY ("fuzz_run_id") REFERENCES "fuzz_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fuzz_counterexamples" ADD CONSTRAINT "fuzz_counterexamples_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fuzz_counterexamples" ADD CONSTRAINT "fuzz_counterexamples_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fuzz_counterexamples" ADD CONSTRAINT "fuzz_counterexamples_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fuzz_counterexamples" ADD CONSTRAINT "fuzz_counterexamples_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invariant_runs" ADD CONSTRAINT "invariant_runs_fuzz_run_id_fkey" FOREIGN KEY ("fuzz_run_id") REFERENCES "fuzz_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invariant_runs" ADD CONSTRAINT "invariant_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invariant_runs" ADD CONSTRAINT "invariant_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invariant_runs" ADD CONSTRAINT "invariant_runs_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invariant_runs" ADD CONSTRAINT "invariant_runs_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invariant_definitions" ADD CONSTRAINT "invariant_definitions_fuzz_run_id_fkey" FOREIGN KEY ("fuzz_run_id") REFERENCES "fuzz_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invariant_definitions" ADD CONSTRAINT "invariant_definitions_invariant_run_id_fkey" FOREIGN KEY ("invariant_run_id") REFERENCES "invariant_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invariant_definitions" ADD CONSTRAINT "invariant_definitions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invariant_definitions" ADD CONSTRAINT "invariant_definitions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invariant_definitions" ADD CONSTRAINT "invariant_definitions_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invariant_definitions" ADD CONSTRAINT "invariant_definitions_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invariant_results" ADD CONSTRAINT "invariant_results_fuzz_run_id_fkey" FOREIGN KEY ("fuzz_run_id") REFERENCES "fuzz_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invariant_results" ADD CONSTRAINT "invariant_results_invariant_run_id_fkey" FOREIGN KEY ("invariant_run_id") REFERENCES "invariant_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invariant_results" ADD CONSTRAINT "invariant_results_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "invariant_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invariant_results" ADD CONSTRAINT "invariant_results_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invariant_results" ADD CONSTRAINT "invariant_results_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invariant_results" ADD CONSTRAINT "invariant_results_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invariant_results" ADD CONSTRAINT "invariant_results_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "coverage_summaries" ADD CONSTRAINT "coverage_summaries_fuzz_run_id_fkey" FOREIGN KEY ("fuzz_run_id") REFERENCES "fuzz_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coverage_summaries" ADD CONSTRAINT "coverage_summaries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "coverage_summaries" ADD CONSTRAINT "coverage_summaries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "coverage_summaries" ADD CONSTRAINT "coverage_summaries_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coverage_summaries" ADD CONSTRAINT "coverage_summaries_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fuzz_artifacts" ADD CONSTRAINT "fuzz_artifacts_fuzz_run_id_fkey" FOREIGN KEY ("fuzz_run_id") REFERENCES "fuzz_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fuzz_artifacts" ADD CONSTRAINT "fuzz_artifacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fuzz_artifacts" ADD CONSTRAINT "fuzz_artifacts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fuzz_artifacts" ADD CONSTRAINT "fuzz_artifacts_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fuzz_artifacts" ADD CONSTRAINT "fuzz_artifacts_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
