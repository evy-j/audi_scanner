-- Phase P10: defensive threat knowledge base and exploit signature library persistence.

CREATE TYPE "ThreatIntelSourceType" AS ENUM (
  'INTERNAL_SCAN',
  'USER_FEEDBACK',
  'PUBLIC_REPORT',
  'INCIDENT_WRITEUP',
  'AUDIT_REPORT',
  'MONITORING_EVENT',
  'SIMULATION_ARTIFACT',
  'FUZZ_ARTIFACT',
  'MANUAL_REVIEW',
  'UNKNOWN'
);

CREATE TYPE "ThreatIntelConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'VERIFIED', 'DISPUTED');

CREATE TYPE "ThreatSignatureKind" AS ENUM (
  'REENTRANCY',
  'ACCESS_CONTROL',
  'ORACLE_MANIPULATION',
  'PROXY_UPGRADE',
  'STORAGE_COLLISION',
  'GOVERNANCE',
  'BRIDGE',
  'RUGPULL',
  'HONEYPOT',
  'DOS',
  'INTEGER_PRECISION',
  'UNCHECKED_CALL',
  'FRONT_RUNNING',
  'MEV',
  'LIQUIDITY_RISK',
  'UNKNOWN'
);

CREATE TYPE "ThreatMatchStatus" AS ENUM ('MATCHED', 'PARTIAL', 'NOT_MATCHED', 'INCONCLUSIVE', 'NOT_ASSESSED');

CREATE TABLE "threat_intel_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID,
  "finding_id" UUID,
  "alert_id" UUID,
  "source_type" "ThreatIntelSourceType" NOT NULL,
  "confidence" "ThreatIntelConfidence" NOT NULL DEFAULT 'LOW',
  "title" VARCHAR(240) NOT NULL,
  "summary" TEXT NOT NULL,
  "provenance_url" TEXT,
  "provenance_hash" VARCHAR(128),
  "provenance_reference" TEXT,
  "reviewer_notes" TEXT,
  "metadata" JSONB,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "threat_intel_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "threat_sources" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "threat_intel_entry_id" UUID,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID,
  "source_type" "ThreatIntelSourceType" NOT NULL,
  "title" VARCHAR(240),
  "provenance_url" TEXT,
  "provenance_hash" VARCHAR(128),
  "provenance_reference" TEXT,
  "artifact_path" TEXT,
  "artifact_checksum_sha256" VARCHAR(128),
  "confidence" "ThreatIntelConfidence" NOT NULL DEFAULT 'LOW',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "threat_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "threat_signatures" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "project_id" UUID,
  "threat_intel_entry_id" UUID,
  "source_id" UUID,
  "kind" "ThreatSignatureKind" NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "description" TEXT NOT NULL,
  "defensive_summary" TEXT NOT NULL,
  "confidence" "ThreatIntelConfidence" NOT NULL DEFAULT 'LOW',
  "status" "AccessStatus" NOT NULL DEFAULT 'ACTIVE',
  "affected_analyzers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "affected_rule_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "evidence_requirements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "pattern" JSONB,
  "metadata" JSONB,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "threat_signatures_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "threat_signature_conditions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "signature_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "condition_key" VARCHAR(160) NOT NULL,
  "condition_type" VARCHAR(80) NOT NULL,
  "operator" VARCHAR(40) NOT NULL,
  "expected_value" JSONB,
  "evidence_type" VARCHAR(80),
  "required" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "threat_signature_conditions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "threat_signature_matches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "signature_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID,
  "finding_id" UUID,
  "alert_id" UUID,
  "status" "ThreatMatchStatus" NOT NULL,
  "confidence" "ThreatIntelConfidence" NOT NULL DEFAULT 'LOW',
  "match_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "evidence_ids_used" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "missing_evidence" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "suggested_priority_adjustment" DECIMAL(5,2),
  "human_review_checklist" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "rationale" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "threat_signature_matches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "detector_precision_metrics" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID,
  "finding_id" UUID,
  "analyzer" "AnalyzerType",
  "rule_id" VARCHAR(160),
  "severity" "VulnerabilitySeverity",
  "true_positive_count" INTEGER NOT NULL DEFAULT 0,
  "false_positive_count" INTEGER NOT NULL DEFAULT 0,
  "suppression_count" INTEGER NOT NULL DEFAULT 0,
  "accepted_count" INTEGER NOT NULL DEFAULT 0,
  "reproduced_count" INTEGER NOT NULL DEFAULT 0,
  "not_reproduced_count" INTEGER NOT NULL DEFAULT 0,
  "precision_estimate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "confidence_calibration" JSONB,
  "metadata" JSONB,
  "measured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "detector_precision_metrics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "false_positive_feedback" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID,
  "finding_id" UUID NOT NULL,
  "signature_id" UUID,
  "signature_match_id" UUID,
  "actor_user_id" UUID,
  "reason" TEXT NOT NULL,
  "evidence_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "confidence" "ThreatIntelConfidence" NOT NULL DEFAULT 'MEDIUM',
  "reviewer_notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "false_positive_feedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vulnerability_patterns" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "project_id" UUID,
  "finding_id" UUID,
  "signature_id" UUID,
  "threat_intel_entry_id" UUID,
  "kind" "ThreatSignatureKind" NOT NULL,
  "title" VARCHAR(220) NOT NULL,
  "description" TEXT NOT NULL,
  "pattern_metadata" JSONB,
  "evidence_requirements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "affected_analyzers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "affected_rule_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "confidence" "ThreatIntelConfidence" NOT NULL DEFAULT 'LOW',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vulnerability_patterns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "incident_references" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID,
  "finding_id" UUID,
  "alert_id" UUID,
  "threat_intel_entry_id" UUID,
  "source_id" UUID,
  "source_type" "ThreatIntelSourceType" NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "url" TEXT,
  "reference_hash" VARCHAR(128),
  "summary" TEXT NOT NULL,
  "confidence" "ThreatIntelConfidence" NOT NULL DEFAULT 'LOW',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "incident_references_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wallet_risk_labels" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "project_id" UUID,
  "chain_id" INTEGER,
  "address" VARCHAR(128) NOT NULL,
  "normalized_address" VARCHAR(128) NOT NULL,
  "label" VARCHAR(160) NOT NULL,
  "confidence" "ThreatIntelConfidence" NOT NULL,
  "source_id" UUID,
  "provenance_url" TEXT,
  "provenance_hash" VARCHAR(128),
  "provenance_reference" TEXT,
  "notes" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "wallet_risk_labels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contract_risk_labels" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "project_id" UUID,
  "chain_id" INTEGER,
  "address" VARCHAR(128) NOT NULL,
  "normalized_address" VARCHAR(128) NOT NULL,
  "label" VARCHAR(160) NOT NULL,
  "confidence" "ThreatIntelConfidence" NOT NULL,
  "source_id" UUID,
  "provenance_url" TEXT,
  "provenance_hash" VARCHAR(128),
  "provenance_reference" TEXT,
  "notes" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "contract_risk_labels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "threat_knowledge_revisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID,
  "finding_id" UUID,
  "threat_intel_entry_id" UUID,
  "threat_signature_id" UUID,
  "entity_type" VARCHAR(80) NOT NULL,
  "entity_id" VARCHAR(128) NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "previous_value" JSONB,
  "new_value" JSONB,
  "actor_user_id" UUID,
  "reason" TEXT,
  "source_type" "ThreatIntelSourceType",
  "provenance_reference" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "threat_knowledge_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "threat_signature_matches_signature_id_finding_id_alert_id_key" ON "threat_signature_matches"("signature_id", "finding_id", "alert_id");
CREATE UNIQUE INDEX "detector_precision_metrics_organization_id_analyzer_rule_id_severity_key" ON "detector_precision_metrics"("organization_id", "analyzer", "rule_id", "severity");

CREATE INDEX "threat_intel_entries_organization_id_source_type_confidence_created_at_idx" ON "threat_intel_entries"("organization_id", "source_type", "confidence", "created_at");
CREATE INDEX "threat_intel_entries_project_id_created_at_idx" ON "threat_intel_entries"("project_id", "created_at");
CREATE INDEX "threat_intel_entries_scan_id_created_at_idx" ON "threat_intel_entries"("scan_id", "created_at");
CREATE INDEX "threat_intel_entries_finding_id_created_at_idx" ON "threat_intel_entries"("finding_id", "created_at");
CREATE INDEX "threat_sources_organization_id_source_type_created_at_idx" ON "threat_sources"("organization_id", "source_type", "created_at");
CREATE INDEX "threat_sources_threat_intel_entry_id_created_at_idx" ON "threat_sources"("threat_intel_entry_id", "created_at");
CREATE INDEX "threat_signatures_organization_id_kind_status_created_at_idx" ON "threat_signatures"("organization_id", "kind", "status", "created_at");
CREATE INDEX "threat_signatures_project_id_kind_status_idx" ON "threat_signatures"("project_id", "kind", "status");
CREATE INDEX "threat_signature_conditions_signature_id_required_idx" ON "threat_signature_conditions"("signature_id", "required");
CREATE INDEX "threat_signature_matches_scan_id_status_created_at_idx" ON "threat_signature_matches"("scan_id", "status", "created_at");
CREATE INDEX "threat_signature_matches_finding_id_status_created_at_idx" ON "threat_signature_matches"("finding_id", "status", "created_at");
CREATE INDEX "threat_signature_matches_alert_id_status_created_at_idx" ON "threat_signature_matches"("alert_id", "status", "created_at");
CREATE INDEX "detector_precision_metrics_project_id_analyzer_rule_id_idx" ON "detector_precision_metrics"("project_id", "analyzer", "rule_id");
CREATE INDEX "false_positive_feedback_finding_id_created_at_idx" ON "false_positive_feedback"("finding_id", "created_at");
CREATE INDEX "false_positive_feedback_organization_id_created_at_idx" ON "false_positive_feedback"("organization_id", "created_at");
CREATE INDEX "vulnerability_patterns_organization_id_kind_created_at_idx" ON "vulnerability_patterns"("organization_id", "kind", "created_at");
CREATE INDEX "vulnerability_patterns_finding_id_created_at_idx" ON "vulnerability_patterns"("finding_id", "created_at");
CREATE INDEX "incident_references_organization_id_source_type_created_at_idx" ON "incident_references"("organization_id", "source_type", "created_at");
CREATE INDEX "incident_references_scan_id_created_at_idx" ON "incident_references"("scan_id", "created_at");
CREATE INDEX "wallet_risk_labels_normalized_address_chain_id_idx" ON "wallet_risk_labels"("normalized_address", "chain_id");
CREATE INDEX "wallet_risk_labels_organization_id_confidence_created_at_idx" ON "wallet_risk_labels"("organization_id", "confidence", "created_at");
CREATE INDEX "contract_risk_labels_normalized_address_chain_id_idx" ON "contract_risk_labels"("normalized_address", "chain_id");
CREATE INDEX "contract_risk_labels_organization_id_confidence_created_at_idx" ON "contract_risk_labels"("organization_id", "confidence", "created_at");
CREATE INDEX "threat_knowledge_revisions_organization_id_entity_type_created_at_idx" ON "threat_knowledge_revisions"("organization_id", "entity_type", "created_at");
CREATE INDEX "threat_knowledge_revisions_finding_id_created_at_idx" ON "threat_knowledge_revisions"("finding_id", "created_at");

ALTER TABLE "threat_intel_entries" ADD CONSTRAINT "threat_intel_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "threat_intel_entries" ADD CONSTRAINT "threat_intel_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "threat_intel_entries" ADD CONSTRAINT "threat_intel_entries_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "threat_intel_entries" ADD CONSTRAINT "threat_intel_entries_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "threat_intel_entries" ADD CONSTRAINT "threat_intel_entries_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "monitor_alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "threat_sources" ADD CONSTRAINT "threat_sources_threat_intel_entry_id_fkey" FOREIGN KEY ("threat_intel_entry_id") REFERENCES "threat_intel_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "threat_sources" ADD CONSTRAINT "threat_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "threat_sources" ADD CONSTRAINT "threat_sources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "threat_sources" ADD CONSTRAINT "threat_sources_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "threat_signatures" ADD CONSTRAINT "threat_signatures_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "threat_signatures" ADD CONSTRAINT "threat_signatures_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "threat_signatures" ADD CONSTRAINT "threat_signatures_threat_intel_entry_id_fkey" FOREIGN KEY ("threat_intel_entry_id") REFERENCES "threat_intel_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "threat_signatures" ADD CONSTRAINT "threat_signatures_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "threat_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "threat_signature_conditions" ADD CONSTRAINT "threat_signature_conditions_signature_id_fkey" FOREIGN KEY ("signature_id") REFERENCES "threat_signatures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "threat_signature_conditions" ADD CONSTRAINT "threat_signature_conditions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "threat_signature_conditions" ADD CONSTRAINT "threat_signature_conditions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "threat_signature_matches" ADD CONSTRAINT "threat_signature_matches_signature_id_fkey" FOREIGN KEY ("signature_id") REFERENCES "threat_signatures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "threat_signature_matches" ADD CONSTRAINT "threat_signature_matches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "threat_signature_matches" ADD CONSTRAINT "threat_signature_matches_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "threat_signature_matches" ADD CONSTRAINT "threat_signature_matches_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "threat_signature_matches" ADD CONSTRAINT "threat_signature_matches_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "threat_signature_matches" ADD CONSTRAINT "threat_signature_matches_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "monitor_alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "detector_precision_metrics" ADD CONSTRAINT "detector_precision_metrics_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "detector_precision_metrics" ADD CONSTRAINT "detector_precision_metrics_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "detector_precision_metrics" ADD CONSTRAINT "detector_precision_metrics_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "detector_precision_metrics" ADD CONSTRAINT "detector_precision_metrics_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "false_positive_feedback" ADD CONSTRAINT "false_positive_feedback_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "false_positive_feedback" ADD CONSTRAINT "false_positive_feedback_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "false_positive_feedback" ADD CONSTRAINT "false_positive_feedback_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "false_positive_feedback" ADD CONSTRAINT "false_positive_feedback_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "false_positive_feedback" ADD CONSTRAINT "false_positive_feedback_signature_id_fkey" FOREIGN KEY ("signature_id") REFERENCES "threat_signatures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "false_positive_feedback" ADD CONSTRAINT "false_positive_feedback_signature_match_id_fkey" FOREIGN KEY ("signature_match_id") REFERENCES "threat_signature_matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vulnerability_patterns" ADD CONSTRAINT "vulnerability_patterns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vulnerability_patterns" ADD CONSTRAINT "vulnerability_patterns_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vulnerability_patterns" ADD CONSTRAINT "vulnerability_patterns_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vulnerability_patterns" ADD CONSTRAINT "vulnerability_patterns_signature_id_fkey" FOREIGN KEY ("signature_id") REFERENCES "threat_signatures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vulnerability_patterns" ADD CONSTRAINT "vulnerability_patterns_threat_intel_entry_id_fkey" FOREIGN KEY ("threat_intel_entry_id") REFERENCES "threat_intel_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "incident_references" ADD CONSTRAINT "incident_references_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incident_references" ADD CONSTRAINT "incident_references_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incident_references" ADD CONSTRAINT "incident_references_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incident_references" ADD CONSTRAINT "incident_references_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incident_references" ADD CONSTRAINT "incident_references_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "monitor_alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incident_references" ADD CONSTRAINT "incident_references_threat_intel_entry_id_fkey" FOREIGN KEY ("threat_intel_entry_id") REFERENCES "threat_intel_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incident_references" ADD CONSTRAINT "incident_references_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "threat_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "wallet_risk_labels" ADD CONSTRAINT "wallet_risk_labels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "wallet_risk_labels" ADD CONSTRAINT "wallet_risk_labels_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "wallet_risk_labels" ADD CONSTRAINT "wallet_risk_labels_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "threat_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contract_risk_labels" ADD CONSTRAINT "contract_risk_labels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contract_risk_labels" ADD CONSTRAINT "contract_risk_labels_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contract_risk_labels" ADD CONSTRAINT "contract_risk_labels_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "threat_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "threat_knowledge_revisions" ADD CONSTRAINT "threat_knowledge_revisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "threat_knowledge_revisions" ADD CONSTRAINT "threat_knowledge_revisions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "threat_knowledge_revisions" ADD CONSTRAINT "threat_knowledge_revisions_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "threat_knowledge_revisions" ADD CONSTRAINT "threat_knowledge_revisions_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "threat_knowledge_revisions" ADD CONSTRAINT "threat_knowledge_revisions_threat_intel_entry_id_fkey" FOREIGN KEY ("threat_intel_entry_id") REFERENCES "threat_intel_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "threat_knowledge_revisions" ADD CONSTRAINT "threat_knowledge_revisions_threat_signature_id_fkey" FOREIGN KEY ("threat_signature_id") REFERENCES "threat_signatures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
