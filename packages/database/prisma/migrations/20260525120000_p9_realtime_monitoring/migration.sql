-- Phase P9: read-only realtime on-chain monitoring MVP persistence.

CREATE TYPE "MonitorStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DISABLED', 'ERROR');

CREATE TYPE "MonitorTargetKind" AS ENUM (
  'CONTRACT',
  'PROXY',
  'TOKEN',
  'POOL',
  'GOVERNANCE',
  'WALLET',
  'PROJECT'
);

CREATE TYPE "MonitorRuleKind" AS ENUM (
  'PROXY_UPGRADE',
  'ADMIN_ROLE_CHANGE',
  'PRIVILEGED_FUNCTION_CALL',
  'OWNERSHIP_TRANSFER',
  'PAUSE_UNPAUSE',
  'LIQUIDITY_REMOVAL',
  'LARGE_TOKEN_TRANSFER',
  'ORACLE_DEVIATION',
  'CONTRACT_ACTIVITY_DRIFT',
  'UNKNOWN_EVENT_SPIKE',
  'CUSTOM_EVENT_MATCH'
);

CREATE TYPE "MonitorEventStatus" AS ENUM ('OBSERVED', 'CONFIRMED', 'REORGED', 'FAILED', 'NOT_ASSESSED');

CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED', 'SUPPRESSED');

CREATE TABLE "monitor_targets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "scan_id" UUID,
  "contract_id" UUID,
  "chain_id" INTEGER NOT NULL,
  "address" VARCHAR(128) NOT NULL,
  "normalized_address" VARCHAR(128) NOT NULL,
  "kind" "MonitorTargetKind" NOT NULL,
  "status" "MonitorStatus" NOT NULL DEFAULT 'DISABLED',
  "display_name" VARCHAR(180),
  "source" VARCHAR(80) NOT NULL DEFAULT 'MANUAL',
  "provider_name" VARCHAR(120),
  "abi" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "monitor_targets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "monitor_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "target_id" UUID,
  "kind" "MonitorRuleKind" NOT NULL,
  "status" "MonitorStatus" NOT NULL DEFAULT 'ACTIVE',
  "severity" "AlertSeverity" NOT NULL DEFAULT 'MEDIUM',
  "name" VARCHAR(180) NOT NULL,
  "event_signature" VARCHAR(160),
  "function_selector" VARCHAR(16),
  "threshold" VARCHAR(120),
  "config" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "monitor_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "monitor_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "target_id" UUID,
  "scan_id" UUID,
  "chain_id" INTEGER,
  "status" "MonitorEventStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  "provider_name" VARCHAR(120),
  "from_block" BIGINT,
  "to_block" BIGINT,
  "latest_block" BIGINT,
  "event_count" INTEGER NOT NULL DEFAULT 0,
  "transaction_count" INTEGER NOT NULL DEFAULT 0,
  "alert_count" INTEGER NOT NULL DEFAULT 0,
  "error_category" VARCHAR(120),
  "error" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL,
  "finished_at" TIMESTAMP(3),
  "duration_ms" INTEGER,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "monitor_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "monitor_cursors" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "target_id" UUID,
  "chain_id" INTEGER NOT NULL,
  "provider_name" VARCHAR(120),
  "last_processed_block" BIGINT,
  "last_processed_block_hash" VARCHAR(128),
  "last_finalized_block" BIGINT,
  "status" "MonitorEventStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  "error_category" VARCHAR(120),
  "error" TEXT,
  "metadata" JSONB,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "monitor_cursors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "onchain_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "target_id" UUID,
  "monitor_run_id" UUID,
  "scan_id" UUID,
  "chain_id" INTEGER NOT NULL,
  "hash" VARCHAR(128) NOT NULL,
  "block_number" BIGINT NOT NULL,
  "block_hash" VARCHAR(128) NOT NULL,
  "from_address" VARCHAR(128),
  "to_address" VARCHAR(128),
  "input_selector" VARCHAR(16),
  "input" TEXT,
  "value" VARCHAR(120),
  "provider_name" VARCHAR(120),
  "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "onchain_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "onchain_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "target_id" UUID,
  "monitor_run_id" UUID,
  "transaction_id" UUID,
  "scan_id" UUID,
  "chain_id" INTEGER NOT NULL,
  "address" VARCHAR(128) NOT NULL,
  "normalized_address" VARCHAR(128) NOT NULL,
  "block_number" BIGINT NOT NULL,
  "block_hash" VARCHAR(128) NOT NULL,
  "transaction_hash" VARCHAR(128) NOT NULL,
  "log_index" INTEGER NOT NULL,
  "event_signature" VARCHAR(128),
  "event_name" VARCHAR(160),
  "topics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "data" TEXT NOT NULL,
  "decoded_data" JSONB,
  "decode_status" VARCHAR(80) NOT NULL DEFAULT 'NOT_ASSESSED',
  "raw_artifact_path" TEXT,
  "raw_artifact_checksum_sha256" VARCHAR(128),
  "status" "MonitorEventStatus" NOT NULL DEFAULT 'OBSERVED',
  "provider_name" VARCHAR(120),
  "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "onchain_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "monitor_alerts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "target_id" UUID,
  "monitor_rule_id" UUID,
  "monitor_run_id" UUID,
  "scan_id" UUID,
  "chain_id" INTEGER NOT NULL,
  "kind" "MonitorRuleKind" NOT NULL,
  "severity" "AlertSeverity" NOT NULL DEFAULT 'MEDIUM',
  "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
  "title" VARCHAR(240) NOT NULL,
  "summary" TEXT NOT NULL,
  "idempotency_key" VARCHAR(240) NOT NULL,
  "target_address" VARCHAR(128) NOT NULL,
  "transaction_hash" VARCHAR(128),
  "block_number" BIGINT,
  "log_index" INTEGER,
  "provider_name" VARCHAR(120),
  "observed_at" TIMESTAMP(3) NOT NULL,
  "resolved_at" TIMESTAMP(3),
  "dismissed_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "monitor_alerts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alert_evidence" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "alert_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "scan_id" UUID,
  "event_id" UUID,
  "transaction_id" UUID,
  "rule_kind" "MonitorRuleKind" NOT NULL,
  "target_address" VARCHAR(128) NOT NULL,
  "chain_id" INTEGER NOT NULL,
  "transaction_hash" VARCHAR(128) NOT NULL,
  "block_number" BIGINT NOT NULL,
  "log_index" INTEGER,
  "tx_input_selector" VARCHAR(16),
  "provider_name" VARCHAR(120),
  "decoded_data" JSONB,
  "raw_data" JSONB,
  "raw_artifact_path" TEXT,
  "raw_artifact_checksum_sha256" VARCHAR(128),
  "observed_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alert_evidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alert_comments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "alert_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alert_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alert_status_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "alert_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "previous_status" "AlertStatus",
  "new_status" "AlertStatus" NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alert_status_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_webhooks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "name" VARCHAR(180),
  "url" TEXT NOT NULL,
  "redacted_url" TEXT NOT NULL,
  "url_sha256" VARCHAR(128) NOT NULL,
  "signing_secret" TEXT NOT NULL,
  "signing_secret_hash" VARCHAR(128) NOT NULL,
  "status" "AccessStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  "last_delivered_at" TIMESTAMP(3),
  "metadata" JSONB,
  CONSTRAINT "project_webhooks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alert_webhook_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "alert_id" UUID NOT NULL,
  "webhook_id" UUID,
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "status" VARCHAR(80) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "payload_checksum_sha256" VARCHAR(128) NOT NULL,
  "response_status" INTEGER,
  "error_category" VARCHAR(120),
  "error" TEXT,
  "next_attempt_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "metadata" JSONB,
  CONSTRAINT "alert_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "monitor_targets_project_id_chain_id_normalized_address_key" ON "monitor_targets"("project_id", "chain_id", "normalized_address");
CREATE INDEX "monitor_targets_organization_id_status_created_at_idx" ON "monitor_targets"("organization_id", "status", "created_at");
CREATE INDEX "monitor_targets_project_id_status_kind_idx" ON "monitor_targets"("project_id", "status", "kind");
CREATE INDEX "monitor_rules_project_id_kind_status_idx" ON "monitor_rules"("project_id", "kind", "status");
CREATE INDEX "monitor_rules_target_id_kind_status_idx" ON "monitor_rules"("target_id", "kind", "status");
CREATE INDEX "monitor_runs_project_id_status_created_at_idx" ON "monitor_runs"("project_id", "status", "created_at");
CREATE INDEX "monitor_runs_target_id_created_at_idx" ON "monitor_runs"("target_id", "created_at");
CREATE UNIQUE INDEX "monitor_cursors_project_id_chain_id_target_id_key" ON "monitor_cursors"("project_id", "chain_id", "target_id");
CREATE INDEX "monitor_cursors_project_id_chain_id_idx" ON "monitor_cursors"("project_id", "chain_id");
CREATE UNIQUE INDEX "onchain_transactions_chain_id_hash_key" ON "onchain_transactions"("chain_id", "hash");
CREATE INDEX "onchain_transactions_project_id_block_number_idx" ON "onchain_transactions"("project_id", "block_number");
CREATE INDEX "onchain_transactions_target_id_block_number_idx" ON "onchain_transactions"("target_id", "block_number");
CREATE UNIQUE INDEX "onchain_events_chain_id_transaction_hash_log_index_key" ON "onchain_events"("chain_id", "transaction_hash", "log_index");
CREATE INDEX "onchain_events_project_id_block_number_idx" ON "onchain_events"("project_id", "block_number");
CREATE INDEX "onchain_events_target_id_block_number_idx" ON "onchain_events"("target_id", "block_number");
CREATE INDEX "onchain_events_event_signature_block_number_idx" ON "onchain_events"("event_signature", "block_number");
CREATE UNIQUE INDEX "monitor_alerts_idempotency_key_key" ON "monitor_alerts"("idempotency_key");
CREATE INDEX "monitor_alerts_project_id_status_severity_created_at_idx" ON "monitor_alerts"("project_id", "status", "severity", "created_at");
CREATE INDEX "monitor_alerts_target_id_created_at_idx" ON "monitor_alerts"("target_id", "created_at");
CREATE INDEX "monitor_alerts_kind_observed_at_idx" ON "monitor_alerts"("kind", "observed_at");
CREATE INDEX "alert_evidence_alert_id_created_at_idx" ON "alert_evidence"("alert_id", "created_at");
CREATE INDEX "alert_evidence_project_id_rule_kind_created_at_idx" ON "alert_evidence"("project_id", "rule_kind", "created_at");
CREATE INDEX "alert_comments_alert_id_created_at_idx" ON "alert_comments"("alert_id", "created_at");
CREATE INDEX "alert_status_events_alert_id_created_at_idx" ON "alert_status_events"("alert_id", "created_at");
CREATE INDEX "project_webhooks_project_id_status_created_at_idx" ON "project_webhooks"("project_id", "status", "created_at");
CREATE INDEX "alert_webhook_deliveries_alert_id_status_created_at_idx" ON "alert_webhook_deliveries"("alert_id", "status", "created_at");
CREATE INDEX "alert_webhook_deliveries_webhook_id_status_created_at_idx" ON "alert_webhook_deliveries"("webhook_id", "status", "created_at");

ALTER TABLE "monitor_targets" ADD CONSTRAINT "monitor_targets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "monitor_targets" ADD CONSTRAINT "monitor_targets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "monitor_targets" ADD CONSTRAINT "monitor_targets_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "monitor_targets" ADD CONSTRAINT "monitor_targets_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "monitor_rules" ADD CONSTRAINT "monitor_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "monitor_rules" ADD CONSTRAINT "monitor_rules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "monitor_rules" ADD CONSTRAINT "monitor_rules_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "monitor_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "monitor_runs" ADD CONSTRAINT "monitor_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "monitor_runs" ADD CONSTRAINT "monitor_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "monitor_runs" ADD CONSTRAINT "monitor_runs_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "monitor_targets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "monitor_runs" ADD CONSTRAINT "monitor_runs_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "monitor_cursors" ADD CONSTRAINT "monitor_cursors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "monitor_cursors" ADD CONSTRAINT "monitor_cursors_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "monitor_cursors" ADD CONSTRAINT "monitor_cursors_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "monitor_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "onchain_transactions" ADD CONSTRAINT "onchain_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "onchain_transactions" ADD CONSTRAINT "onchain_transactions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "onchain_transactions" ADD CONSTRAINT "onchain_transactions_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "monitor_targets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "onchain_transactions" ADD CONSTRAINT "onchain_transactions_monitor_run_id_fkey" FOREIGN KEY ("monitor_run_id") REFERENCES "monitor_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "onchain_transactions" ADD CONSTRAINT "onchain_transactions_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "onchain_events" ADD CONSTRAINT "onchain_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "onchain_events" ADD CONSTRAINT "onchain_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "onchain_events" ADD CONSTRAINT "onchain_events_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "monitor_targets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "onchain_events" ADD CONSTRAINT "onchain_events_monitor_run_id_fkey" FOREIGN KEY ("monitor_run_id") REFERENCES "monitor_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "onchain_events" ADD CONSTRAINT "onchain_events_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "onchain_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "onchain_events" ADD CONSTRAINT "onchain_events_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "monitor_alerts" ADD CONSTRAINT "monitor_alerts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "monitor_alerts" ADD CONSTRAINT "monitor_alerts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "monitor_alerts" ADD CONSTRAINT "monitor_alerts_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "monitor_targets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "monitor_alerts" ADD CONSTRAINT "monitor_alerts_monitor_rule_id_fkey" FOREIGN KEY ("monitor_rule_id") REFERENCES "monitor_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "monitor_alerts" ADD CONSTRAINT "monitor_alerts_monitor_run_id_fkey" FOREIGN KEY ("monitor_run_id") REFERENCES "monitor_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "monitor_alerts" ADD CONSTRAINT "monitor_alerts_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "alert_evidence" ADD CONSTRAINT "alert_evidence_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "monitor_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alert_evidence" ADD CONSTRAINT "alert_evidence_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alert_evidence" ADD CONSTRAINT "alert_evidence_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alert_evidence" ADD CONSTRAINT "alert_evidence_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "alert_evidence" ADD CONSTRAINT "alert_evidence_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "onchain_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "alert_evidence" ADD CONSTRAINT "alert_evidence_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "onchain_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "alert_comments" ADD CONSTRAINT "alert_comments_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "monitor_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alert_comments" ADD CONSTRAINT "alert_comments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alert_comments" ADD CONSTRAINT "alert_comments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "alert_status_events" ADD CONSTRAINT "alert_status_events_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "monitor_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alert_status_events" ADD CONSTRAINT "alert_status_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alert_status_events" ADD CONSTRAINT "alert_status_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_webhooks" ADD CONSTRAINT "project_webhooks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_webhooks" ADD CONSTRAINT "project_webhooks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "alert_webhook_deliveries" ADD CONSTRAINT "alert_webhook_deliveries_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "monitor_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alert_webhook_deliveries" ADD CONSTRAINT "alert_webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "project_webhooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "alert_webhook_deliveries" ADD CONSTRAINT "alert_webhook_deliveries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alert_webhook_deliveries" ADD CONSTRAINT "alert_webhook_deliveries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
