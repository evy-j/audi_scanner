
DO $$ BEGIN
  CREATE TYPE "SecurityOsDeepPhase" AS ENUM ('P15','P16','P17','P18','P19','P20','P21','P22','P23','P24','P25','P25_PLUS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SecurityOsArtifactType" AS ENUM (
    'FORMAL_SPEC','FORMAL_RUN','FORMAL_PROOF_ARTIFACT','AUDIT_ENGAGEMENT','AUDIT_SIGNOFF','PUBLIC_SCORECARD','TRUST_REGISTRY_ENTRY','INCIDENT_REFERENCE','THREAT_INDICATOR','OBSERVABILITY_SNAPSHOT','COST_BUDGET','AUDIT_ROOM','MARKETPLACE_PROFILE','BOUNTY_PROGRAM','BOUNTY_SUBMISSION','DETECTOR_BENCHMARK','EVAL_RUN','INCIDENT_CASE','INCIDENT_TIMELINE_EVENT','COMPLIANCE_CONTROL','COMPLIANCE_EVIDENCE_PACK','APPLIANCE_DEPLOYMENT','APPLIANCE_UPGRADE_PLAN','TRUST_OPERATION_MILESTONE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SecurityOsArtifactStatus" AS ENUM ('DRAFT','NOT_ASSESSED','CONFIGURED','QUEUED','RUNNING','SUCCEEDED','FAILED','BLOCKED','NEEDS_HUMAN_REVIEW','APPROVED','PUBLISHED','REJECTED','REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "security_os_artifacts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "phase" "SecurityOsDeepPhase" NOT NULL,
  "artifact_type" "SecurityOsArtifactType" NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID,
  "finding_id" UUID,
  "source_resource_type" VARCHAR(120),
  "source_resource_id" VARCHAR(160),
  "status" "SecurityOsArtifactStatus" NOT NULL DEFAULT 'DRAFT',
  "title" VARCHAR(240) NOT NULL,
  "summary" TEXT,
  "policy_status" VARCHAR(80) NOT NULL DEFAULT 'REAL_ONLY',
  "provenance" JSONB,
  "evidence_refs" JSONB,
  "payload" JSONB,
  "checksum_sha256" VARCHAR(128),
  "created_by_user_id" UUID,
  "locked_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "security_os_artifacts_phase_artifact_type_status_idx" ON "security_os_artifacts"("phase", "artifact_type", "status");
CREATE INDEX IF NOT EXISTS "security_os_artifacts_organization_id_project_id_phase_idx" ON "security_os_artifacts"("organization_id", "project_id", "phase");
CREATE INDEX IF NOT EXISTS "security_os_artifacts_scan_id_idx" ON "security_os_artifacts"("scan_id");
CREATE INDEX IF NOT EXISTS "security_os_artifacts_finding_id_idx" ON "security_os_artifacts"("finding_id");

CREATE TABLE IF NOT EXISTS "security_os_audit_records" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "phase" "SecurityOsDeepPhase",
  "artifact_id" UUID,
  "organization_id" UUID,
  "project_id" UUID,
  "actor_user_id" UUID,
  "action" VARCHAR(160) NOT NULL,
  "decision" "AccessAuditDecision" NOT NULL DEFAULT 'ALLOWED',
  "reason" TEXT,
  "request_id" VARCHAR(160),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "security_os_audit_records_organization_id_created_at_idx" ON "security_os_audit_records"("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "security_os_audit_records_phase_created_at_idx" ON "security_os_audit_records"("phase", "created_at");
CREATE INDEX IF NOT EXISTS "security_os_audit_records_artifact_id_idx" ON "security_os_audit_records"("artifact_id");
