-- P1 evidence-backed finding model.
ALTER TYPE "AnalyzerType" ADD VALUE IF NOT EXISTS 'ADERYN';

-- CreateEnum
CREATE TYPE "FindingConfidenceState" AS ENUM (
  'CANDIDATE',
  'SUPPORTED',
  'TRIAGED',
  'SIMULATED',
  'CONFIRMED',
  'REJECTED',
  'NOT_ASSESSED'
);

-- CreateEnum
CREATE TYPE "FindingEvidenceType" AS ENUM (
  'ANALYZER',
  'SOURCE',
  'TRACE'
);

-- AlterTable
ALTER TABLE "vulnerabilities"
  ADD COLUMN "confidence_state" "FindingConfidenceState" NOT NULL DEFAULT 'CANDIDATE',
  ADD COLUMN "severity_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "confidence_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "exploitability_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "priority_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "evidence_quality" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "source_ranges" (
  "id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "file_path" TEXT NOT NULL,
  "start_line" INTEGER,
  "end_line" INTEGER,
  "start_column" INTEGER,
  "end_column" INTEGER,
  "snippet" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "source_ranges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding_evidence" (
  "id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "analyzer_run_id" UUID,
  "source_range_id" UUID,
  "evidence_type" "FindingEvidenceType" NOT NULL,
  "file_path" TEXT,
  "start_line" INTEGER,
  "end_line" INTEGER,
  "start_column" INTEGER,
  "end_column" INTEGER,
  "snippet" TEXT,
  "rule_id" VARCHAR(160),
  "detector_name" VARCHAR(160),
  "message" TEXT,
  "confidence_contribution" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "raw_artifact_path" TEXT,
  "raw_artifact_checksum" VARCHAR(128),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "finding_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analyzer_evidence" (
  "id" UUID NOT NULL,
  "finding_evidence_id" UUID NOT NULL,
  "analyzer_run_id" UUID,
  "analyzer" "AnalyzerType" NOT NULL,
  "tool_name" VARCHAR(80) NOT NULL,
  "rule_id" VARCHAR(160),
  "detector_name" VARCHAR(160),
  "message" TEXT,
  "raw_artifact_path" TEXT,
  "raw_artifact_checksum" VARCHAR(128),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "analyzer_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trace_evidence" (
  "id" UUID NOT NULL,
  "finding_evidence_id" UUID NOT NULL,
  "trace" JSONB NOT NULL,
  "transaction_hash" VARCHAR(128),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "trace_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detector_metadata" (
  "id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "finding_evidence_id" UUID,
  "analyzer" "AnalyzerType" NOT NULL,
  "rule_id" VARCHAR(160),
  "detector_name" VARCHAR(160),
  "category" "VulnerabilityCategory",
  "severity" "VulnerabilitySeverity",
  "confidence" "VulnerabilityConfidence",
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "detector_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding_decisions" (
  "id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "state" "FindingConfidenceState" NOT NULL,
  "severity_score" DECIMAL(5,2) NOT NULL,
  "confidence_score" DECIMAL(5,2) NOT NULL,
  "exploitability_score" DECIMAL(5,2) NOT NULL,
  "priority_score" DECIMAL(5,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "decided_by" VARCHAR(120) NOT NULL DEFAULT 'deterministic-scoring/v1',
  "metadata" JSONB,
  "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "finding_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "source_ranges_finding_id_file_path_idx" ON "source_ranges"("finding_id", "file_path");

-- CreateIndex
CREATE INDEX "finding_evidence_finding_id_evidence_type_idx" ON "finding_evidence"("finding_id", "evidence_type");

-- CreateIndex
CREATE INDEX "finding_evidence_analyzer_run_id_idx" ON "finding_evidence"("analyzer_run_id");

-- CreateIndex
CREATE INDEX "finding_evidence_file_path_start_line_idx" ON "finding_evidence"("file_path", "start_line");

-- CreateIndex
CREATE UNIQUE INDEX "analyzer_evidence_finding_evidence_id_key" ON "analyzer_evidence"("finding_evidence_id");

-- CreateIndex
CREATE INDEX "analyzer_evidence_analyzer_rule_id_idx" ON "analyzer_evidence"("analyzer", "rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "trace_evidence_finding_evidence_id_key" ON "trace_evidence"("finding_evidence_id");

-- CreateIndex
CREATE INDEX "detector_metadata_finding_id_idx" ON "detector_metadata"("finding_id");

-- CreateIndex
CREATE INDEX "detector_metadata_analyzer_rule_id_idx" ON "detector_metadata"("analyzer", "rule_id");

-- CreateIndex
CREATE INDEX "finding_decisions_finding_id_decided_at_idx" ON "finding_decisions"("finding_id", "decided_at");

-- CreateIndex
CREATE INDEX "finding_decisions_state_priority_score_idx" ON "finding_decisions"("state", "priority_score");

-- AddForeignKey
ALTER TABLE "source_ranges" ADD CONSTRAINT "source_ranges_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_evidence" ADD CONSTRAINT "finding_evidence_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_evidence" ADD CONSTRAINT "finding_evidence_analyzer_run_id_fkey" FOREIGN KEY ("analyzer_run_id") REFERENCES "analyzer_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_evidence" ADD CONSTRAINT "finding_evidence_source_range_id_fkey" FOREIGN KEY ("source_range_id") REFERENCES "source_ranges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyzer_evidence" ADD CONSTRAINT "analyzer_evidence_finding_evidence_id_fkey" FOREIGN KEY ("finding_evidence_id") REFERENCES "finding_evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyzer_evidence" ADD CONSTRAINT "analyzer_evidence_analyzer_run_id_fkey" FOREIGN KEY ("analyzer_run_id") REFERENCES "analyzer_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trace_evidence" ADD CONSTRAINT "trace_evidence_finding_evidence_id_fkey" FOREIGN KEY ("finding_evidence_id") REFERENCES "finding_evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detector_metadata" ADD CONSTRAINT "detector_metadata_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detector_metadata" ADD CONSTRAINT "detector_metadata_finding_evidence_id_fkey" FOREIGN KEY ("finding_evidence_id") REFERENCES "finding_evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_decisions" ADD CONSTRAINT "finding_decisions_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
