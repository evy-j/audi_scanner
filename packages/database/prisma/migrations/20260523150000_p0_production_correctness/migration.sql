-- Extend scan and vulnerability enums for persisted P0 correctness.
ALTER TYPE "ScanStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';

ALTER TYPE "VulnerabilityCategory" ADD VALUE IF NOT EXISTS 'SUSPICIOUS_OWNERSHIP';
ALTER TYPE "VulnerabilityCategory" ADD VALUE IF NOT EXISTS 'INSECURE_RANDOMNESS';
ALTER TYPE "VulnerabilityCategory" ADD VALUE IF NOT EXISTS 'DENIAL_OF_SERVICE';
ALTER TYPE "VulnerabilityCategory" ADD VALUE IF NOT EXISTS 'BUSINESS_LOGIC';

-- CreateEnum
CREATE TYPE "AnalyzerRunStatus" AS ENUM (
  'RUNNING',
  'COMPLETED',
  'TOOL_NOT_INSTALLED',
  'PROVIDER_NOT_CONFIGURED',
  'TIMEOUT',
  'FAILED',
  'NOT_ASSESSED',
  'CANCELED'
);

-- CreateEnum
CREATE TYPE "OutboxMessageStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'PROCESSED',
  'FAILED'
);

-- CreateTable
CREATE TABLE "analyzer_runs" (
  "id" UUID NOT NULL,
  "scan_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "analyzer" "AnalyzerType" NOT NULL,
  "tool_name" VARCHAR(80) NOT NULL,
  "status" "AnalyzerRunStatus" NOT NULL DEFAULT 'RUNNING',
  "started_at" TIMESTAMP(3) NOT NULL,
  "finished_at" TIMESTAMP(3),
  "duration_ms" INTEGER,
  "exit_code" INTEGER,
  "error" TEXT,
  "raw_artifact_key" TEXT,
  "raw_artifact_checksum_sha256" VARCHAR(128),
  "standardized_artifact_key" TEXT,
  "metadata" JSONB,
  "trace_id" VARCHAR(128),
  "correlation_id" VARCHAR(128),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "analyzer_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_events" (
  "id" UUID NOT NULL,
  "scan_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "sequence" INTEGER,
  "type" VARCHAR(80) NOT NULL,
  "status" "ScanStatus" NOT NULL,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "message" TEXT NOT NULL,
  "job_id" VARCHAR(160),
  "queue_name" VARCHAR(120),
  "worker_id" VARCHAR(160),
  "trace_id" VARCHAR(128),
  "correlation_id" VARCHAR(128),
  "data" JSONB,
  "emitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "scan_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_messages" (
  "id" UUID NOT NULL,
  "organization_id" UUID,
  "aggregate_type" VARCHAR(80) NOT NULL,
  "aggregate_id" VARCHAR(128) NOT NULL,
  "event_type" VARCHAR(120) NOT NULL,
  "status" "OutboxMessageStatus" NOT NULL DEFAULT 'PENDING',
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "locked_at" TIMESTAMP(3),
  "processed_at" TIMESTAMP(3),
  "next_attempt_at" TIMESTAMP(3),
  "error" TEXT,
  "trace_id" VARCHAR(128),
  "correlation_id" VARCHAR(128),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analyzer_runs_scan_id_analyzer_started_at_idx" ON "analyzer_runs"("scan_id", "analyzer", "started_at");

-- CreateIndex
CREATE INDEX "analyzer_runs_organization_id_status_started_at_idx" ON "analyzer_runs"("organization_id", "status", "started_at");

-- CreateIndex
CREATE INDEX "scan_events_scan_id_emitted_at_idx" ON "scan_events"("scan_id", "emitted_at");

-- CreateIndex
CREATE INDEX "scan_events_organization_id_emitted_at_idx" ON "scan_events"("organization_id", "emitted_at");

-- CreateIndex
CREATE INDEX "outbox_messages_status_next_attempt_at_created_at_idx" ON "outbox_messages"("status", "next_attempt_at", "created_at");

-- CreateIndex
CREATE INDEX "outbox_messages_aggregate_type_aggregate_id_idx" ON "outbox_messages"("aggregate_type", "aggregate_id");

-- AddForeignKey
ALTER TABLE "analyzer_runs" ADD CONSTRAINT "analyzer_runs_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
