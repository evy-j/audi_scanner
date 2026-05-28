-- P3 real compile/test runner, compiler artifact capture, and tool availability.

CREATE TYPE "BuildToolKind" AS ENUM (
  'FOUNDRY',
  'HARDHAT',
  'TRUFFLE',
  'NPM_SOLIDITY',
  'PLAIN_SOLIDITY',
  'UNKNOWN'
);

CREATE TYPE "BuildRunStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'TIMEOUT',
  'TOOL_NOT_INSTALLED',
  'NOT_ASSESSED'
);

CREATE TYPE "TestRunStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'PASSED',
  'FAILED',
  'TIMEOUT',
  'TOOL_NOT_INSTALLED',
  'NOT_ASSESSED'
);

CREATE TABLE "build_profiles" (
  "id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "tool_kind" "BuildToolKind" NOT NULL,
  "tool_name" VARCHAR(80) NOT NULL,
  "tool_version" VARCHAR(160),
  "project_root" TEXT NOT NULL,
  "config_file" TEXT,
  "confidence" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "detection_reason" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "build_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "build_runs" (
  "id" UUID NOT NULL,
  "build_profile_id" UUID,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "tool_kind" "BuildToolKind" NOT NULL,
  "command" TEXT NOT NULL,
  "status" "BuildRunStatus" NOT NULL DEFAULT 'QUEUED',
  "exit_code" INTEGER,
  "stdout_artifact_key" TEXT,
  "stderr_artifact_key" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL,
  "finished_at" TIMESTAMP(3),
  "duration_ms" INTEGER,
  "error_category" VARCHAR(120),
  "error" TEXT,
  "artifact_checksum_sha256" VARCHAR(128),
  "artifact_path" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "build_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "compiler_artifacts" (
  "id" UUID NOT NULL,
  "build_run_id" UUID,
  "build_profile_id" UUID,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "tool_kind" "BuildToolKind" NOT NULL,
  "artifact_kind" VARCHAR(120) NOT NULL,
  "artifact_path" TEXT NOT NULL,
  "artifact_key" TEXT NOT NULL,
  "checksum_sha256" VARCHAR(128) NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "compiler_version" VARCHAR(160),
  "contract_name" VARCHAR(160),
  "source_file_path" TEXT,
  "abi" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "compiler_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "test_runs" (
  "id" UUID NOT NULL,
  "build_run_id" UUID,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "tool_kind" "BuildToolKind" NOT NULL,
  "command" TEXT NOT NULL,
  "status" "TestRunStatus" NOT NULL DEFAULT 'QUEUED',
  "exit_code" INTEGER,
  "stdout_artifact_key" TEXT,
  "stderr_artifact_key" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL,
  "finished_at" TIMESTAMP(3),
  "duration_ms" INTEGER,
  "error_category" VARCHAR(120),
  "error" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "test_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "test_results" (
  "id" UUID NOT NULL,
  "test_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "suite_name" TEXT,
  "test_name" TEXT NOT NULL,
  "status" VARCHAR(40) NOT NULL,
  "duration_ms" INTEGER,
  "failure_message" TEXT,
  "raw_output_artifact_key" TEXT,
  "raw_output_start_line" INTEGER,
  "raw_output_end_line" INTEGER,
  "gas_used" BIGINT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "test_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "analyzer_tool_availability" (
  "id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "tool_kind" "BuildToolKind" NOT NULL DEFAULT 'UNKNOWN',
  "tool_name" VARCHAR(80) NOT NULL,
  "tool_version" VARCHAR(160),
  "available" BOOLEAN NOT NULL DEFAULT false,
  "status" VARCHAR(80) NOT NULL,
  "detection_command" TEXT,
  "error_category" VARCHAR(120),
  "error" TEXT,
  "artifact_key" TEXT,
  "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "analyzer_tool_availability_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "build_profiles_scan_id_tool_kind_created_at_idx" ON "build_profiles"("scan_id", "tool_kind", "created_at");
CREATE INDEX "build_profiles_organization_id_project_id_created_at_idx" ON "build_profiles"("organization_id", "project_id", "created_at");
CREATE INDEX "build_runs_scan_id_status_started_at_idx" ON "build_runs"("scan_id", "status", "started_at");
CREATE INDEX "build_runs_organization_id_project_id_started_at_idx" ON "build_runs"("organization_id", "project_id", "started_at");
CREATE INDEX "compiler_artifacts_scan_id_artifact_kind_created_at_idx" ON "compiler_artifacts"("scan_id", "artifact_kind", "created_at");
CREATE INDEX "compiler_artifacts_build_run_id_idx" ON "compiler_artifacts"("build_run_id");
CREATE INDEX "test_runs_scan_id_status_started_at_idx" ON "test_runs"("scan_id", "status", "started_at");
CREATE INDEX "test_results_test_run_id_status_idx" ON "test_results"("test_run_id", "status");
CREATE INDEX "test_results_scan_id_status_idx" ON "test_results"("scan_id", "status");
CREATE UNIQUE INDEX "analyzer_tool_availability_scan_id_tool_name_key" ON "analyzer_tool_availability"("scan_id", "tool_name");
CREATE INDEX "analyzer_tool_availability_scan_id_status_idx" ON "analyzer_tool_availability"("scan_id", "status");

ALTER TABLE "build_profiles" ADD CONSTRAINT "build_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "build_profiles" ADD CONSTRAINT "build_profiles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "build_profiles" ADD CONSTRAINT "build_profiles_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "build_runs" ADD CONSTRAINT "build_runs_build_profile_id_fkey" FOREIGN KEY ("build_profile_id") REFERENCES "build_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "build_runs" ADD CONSTRAINT "build_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "build_runs" ADD CONSTRAINT "build_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "build_runs" ADD CONSTRAINT "build_runs_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "compiler_artifacts" ADD CONSTRAINT "compiler_artifacts_build_run_id_fkey" FOREIGN KEY ("build_run_id") REFERENCES "build_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "compiler_artifacts" ADD CONSTRAINT "compiler_artifacts_build_profile_id_fkey" FOREIGN KEY ("build_profile_id") REFERENCES "build_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "compiler_artifacts" ADD CONSTRAINT "compiler_artifacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "compiler_artifacts" ADD CONSTRAINT "compiler_artifacts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "compiler_artifacts" ADD CONSTRAINT "compiler_artifacts_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_build_run_id_fkey" FOREIGN KEY ("build_run_id") REFERENCES "build_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "test_results" ADD CONSTRAINT "test_results_test_run_id_fkey" FOREIGN KEY ("test_run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analyzer_tool_availability" ADD CONSTRAINT "analyzer_tool_availability_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "analyzer_tool_availability" ADD CONSTRAINT "analyzer_tool_availability_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "analyzer_tool_availability" ADD CONSTRAINT "analyzer_tool_availability_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
