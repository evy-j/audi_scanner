-- P7 safe local fork simulation and exploitability proof artifacts.

CREATE TYPE "SimulationStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'TIMEOUT',
  'TOOL_NOT_INSTALLED',
  'PROVIDER_NOT_CONFIGURED',
  'NOT_ASSESSED',
  'NOT_ELIGIBLE',
  'REPRODUCED',
  'NOT_REPRODUCED',
  'INCONCLUSIVE'
);

CREATE TYPE "SimulationKind" AS ENUM (
  'FORK_REPLAY',
  'INVARIANT_CHECK',
  'ACCESS_CONTROL_CHECK',
  'REENTRANCY_PROBE',
  'ORACLE_MANIPULATION_CHECK',
  'PROXY_UPGRADE_CHECK',
  'GENERIC_REPRODUCTION'
);

CREATE TYPE "SimulationSafetyLevel" AS ENUM ('LOCAL_ONLY', 'TESTNET_ONLY', 'DISABLED');

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SIMULATION_RUN';
ALTER TYPE "AuditResource" ADD VALUE IF NOT EXISTS 'SIMULATION';

CREATE TABLE "simulation_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "status" "SimulationStatus" NOT NULL DEFAULT 'QUEUED',
  "kind" "SimulationKind" NOT NULL DEFAULT 'GENERIC_REPRODUCTION',
  "safety_level" "SimulationSafetyLevel" NOT NULL DEFAULT 'LOCAL_ONLY',
  "fork_chain_id" INTEGER,
  "fork_block_number" BIGINT,
  "rpc_provider_name" VARCHAR(120),
  "command_executed" TEXT,
  "input_evidence_checksum" VARCHAR(128),
  "stdout_artifact_path" TEXT,
  "stdout_checksum_sha256" VARCHAR(128),
  "stderr_artifact_path" TEXT,
  "stderr_checksum_sha256" VARCHAR(128),
  "trace_artifact_path" TEXT,
  "trace_checksum_sha256" VARCHAR(128),
  "asset_delta_summary" JSONB,
  "decision" "SimulationStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  "not_eligible_reason" TEXT,
  "error_category" VARCHAR(120),
  "error" TEXT,
  "suggested_confidence_adjustment" TEXT,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "duration_ms" INTEGER,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "simulation_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "simulation_plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "simulation_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "kind" "SimulationKind" NOT NULL,
  "plan_version" VARCHAR(80) NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "summary" TEXT NOT NULL,
  "assumptions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "limitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "command_preview" TEXT,
  "plan_artifact_path" TEXT,
  "plan_checksum_sha256" VARCHAR(128),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "simulation_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "simulation_steps" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "simulation_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "description" TEXT NOT NULL,
  "expected_signal" TEXT,
  "status" "SimulationStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "simulation_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "simulation_traces" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "simulation_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "trace_kind" VARCHAR(80) NOT NULL,
  "artifact_path" TEXT,
  "checksum_sha256" VARCHAR(128),
  "summary" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "simulation_traces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "simulation_asset_deltas" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "simulation_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "asset_type" VARCHAR(80) NOT NULL,
  "asset_address" VARCHAR(128),
  "account_address" VARCHAR(128),
  "delta" VARCHAR(160) NOT NULL,
  "unit" VARCHAR(40),
  "direction" VARCHAR(40),
  "summary" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "simulation_asset_deltas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "simulation_eligibilities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "simulation_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "eligible" BOOLEAN NOT NULL,
  "status" "SimulationStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  "reason" TEXT,
  "safety_level" "SimulationSafetyLevel" NOT NULL DEFAULT 'LOCAL_ONLY',
  "tool_availability" JSONB,
  "limitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "simulation_eligibilities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "simulation_artifacts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "simulation_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "artifact_type" VARCHAR(80) NOT NULL,
  "artifact_path" TEXT NOT NULL,
  "checksum_sha256" VARCHAR(128) NOT NULL,
  "size_bytes" INTEGER,
  "redacted" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "simulation_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "simulation_decisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "simulation_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "decision" "SimulationStatus" NOT NULL,
  "rationale" TEXT NOT NULL,
  "evidence_artifact_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "suggested_confidence_adjustment" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "simulation_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "simulation_runs_finding_id_created_at_idx" ON "simulation_runs"("finding_id", "created_at");
CREATE INDEX "simulation_runs_scan_id_status_created_at_idx" ON "simulation_runs"("scan_id", "status", "created_at");
CREATE INDEX "simulation_runs_organization_id_status_created_at_idx" ON "simulation_runs"("organization_id", "status", "created_at");
CREATE INDEX "simulation_plans_simulation_run_id_created_at_idx" ON "simulation_plans"("simulation_run_id", "created_at");
CREATE INDEX "simulation_plans_finding_id_kind_created_at_idx" ON "simulation_plans"("finding_id", "kind", "created_at");
CREATE INDEX "simulation_steps_simulation_run_id_sort_order_idx" ON "simulation_steps"("simulation_run_id", "sort_order");
CREATE INDEX "simulation_traces_simulation_run_id_created_at_idx" ON "simulation_traces"("simulation_run_id", "created_at");
CREATE INDEX "simulation_asset_deltas_simulation_run_id_created_at_idx" ON "simulation_asset_deltas"("simulation_run_id", "created_at");
CREATE INDEX "simulation_eligibilities_finding_id_created_at_idx" ON "simulation_eligibilities"("finding_id", "created_at");
CREATE INDEX "simulation_artifacts_simulation_run_id_artifact_type_idx" ON "simulation_artifacts"("simulation_run_id", "artifact_type");
CREATE INDEX "simulation_decisions_simulation_run_id_created_at_idx" ON "simulation_decisions"("simulation_run_id", "created_at");
CREATE INDEX "simulation_decisions_finding_id_decision_created_at_idx" ON "simulation_decisions"("finding_id", "decision", "created_at");

ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "simulation_plans" ADD CONSTRAINT "simulation_plans_simulation_run_id_fkey" FOREIGN KEY ("simulation_run_id") REFERENCES "simulation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulation_steps" ADD CONSTRAINT "simulation_steps_simulation_run_id_fkey" FOREIGN KEY ("simulation_run_id") REFERENCES "simulation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulation_traces" ADD CONSTRAINT "simulation_traces_simulation_run_id_fkey" FOREIGN KEY ("simulation_run_id") REFERENCES "simulation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulation_asset_deltas" ADD CONSTRAINT "simulation_asset_deltas_simulation_run_id_fkey" FOREIGN KEY ("simulation_run_id") REFERENCES "simulation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulation_eligibilities" ADD CONSTRAINT "simulation_eligibilities_simulation_run_id_fkey" FOREIGN KEY ("simulation_run_id") REFERENCES "simulation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulation_artifacts" ADD CONSTRAINT "simulation_artifacts_simulation_run_id_fkey" FOREIGN KEY ("simulation_run_id") REFERENCES "simulation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulation_decisions" ADD CONSTRAINT "simulation_decisions_simulation_run_id_fkey" FOREIGN KEY ("simulation_run_id") REFERENCES "simulation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "simulation_plans" ADD CONSTRAINT "simulation_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "simulation_steps" ADD CONSTRAINT "simulation_steps_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "simulation_traces" ADD CONSTRAINT "simulation_traces_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "simulation_asset_deltas" ADD CONSTRAINT "simulation_asset_deltas_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "simulation_eligibilities" ADD CONSTRAINT "simulation_eligibilities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "simulation_artifacts" ADD CONSTRAINT "simulation_artifacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "simulation_decisions" ADD CONSTRAINT "simulation_decisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "simulation_plans" ADD CONSTRAINT "simulation_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "simulation_steps" ADD CONSTRAINT "simulation_steps_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "simulation_traces" ADD CONSTRAINT "simulation_traces_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "simulation_asset_deltas" ADD CONSTRAINT "simulation_asset_deltas_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "simulation_eligibilities" ADD CONSTRAINT "simulation_eligibilities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "simulation_artifacts" ADD CONSTRAINT "simulation_artifacts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "simulation_decisions" ADD CONSTRAINT "simulation_decisions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "simulation_plans" ADD CONSTRAINT "simulation_plans_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulation_steps" ADD CONSTRAINT "simulation_steps_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulation_traces" ADD CONSTRAINT "simulation_traces_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulation_asset_deltas" ADD CONSTRAINT "simulation_asset_deltas_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulation_eligibilities" ADD CONSTRAINT "simulation_eligibilities_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulation_artifacts" ADD CONSTRAINT "simulation_artifacts_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulation_decisions" ADD CONSTRAINT "simulation_decisions_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "simulation_plans" ADD CONSTRAINT "simulation_plans_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulation_steps" ADD CONSTRAINT "simulation_steps_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulation_traces" ADD CONSTRAINT "simulation_traces_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulation_asset_deltas" ADD CONSTRAINT "simulation_asset_deltas_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulation_eligibilities" ADD CONSTRAINT "simulation_eligibilities_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulation_artifacts" ADD CONSTRAINT "simulation_artifacts_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulation_decisions" ADD CONSTRAINT "simulation_decisions_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
