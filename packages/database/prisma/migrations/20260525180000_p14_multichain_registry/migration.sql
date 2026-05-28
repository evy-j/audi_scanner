-- Phase P14: multi-chain registry, explorer metadata, RPC endpoint references, and feature support.
-- RPC URLs and API keys are represented by env-var names / provider labels only; raw secrets are not persisted.

CREATE TYPE "ChainFeatureStatus" AS ENUM ('SUPPORTED', 'PARTIAL', 'NOT_SUPPORTED', 'NOT_ASSESSED');
CREATE TYPE "ChainRpcEndpointStatus" AS ENUM ('ACTIVE', 'DISABLED', 'ERROR', 'NOT_CONFIGURED');

CREATE TABLE "chain_explorers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "chain_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "base_url" TEXT NOT NULL,
  "api_base_url" TEXT,
  "api_key_env_key" VARCHAR(120),
  "status" "ChainStatus" NOT NULL DEFAULT 'ACTIVE',
  "supports_contract_verification" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "chain_explorers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chain_rpc_endpoints" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "project_id" UUID,
  "chain_id" UUID NOT NULL,
  "provider_name" VARCHAR(120) NOT NULL,
  "endpoint_env_key" VARCHAR(160) NOT NULL,
  "redacted_host" VARCHAR(180),
  "priority" INTEGER NOT NULL DEFAULT 100,
  "status" "ChainRpcEndpointStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
  "last_health_status" VARCHAR(80),
  "last_checked_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "chain_rpc_endpoints_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chain_feature_support" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "chain_id" UUID NOT NULL,
  "feature_key" VARCHAR(80) NOT NULL,
  "status" "ChainFeatureStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  "notes" TEXT,
  "required_config" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "chain_feature_support_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chain_registry_audit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "project_id" UUID,
  "chain_id" UUID,
  "actor_user_id" UUID,
  "api_key_id" UUID,
  "action" VARCHAR(120) NOT NULL,
  "resource_type" VARCHAR(80) NOT NULL,
  "resource_id" UUID,
  "metadata" JSONB,
  "request_id" VARCHAR(120),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chain_registry_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chain_explorers_chain_id_status_idx" ON "chain_explorers"("chain_id", "status");
CREATE INDEX "chain_rpc_endpoints_organization_id_project_id_idx" ON "chain_rpc_endpoints"("organization_id", "project_id");
CREATE INDEX "chain_rpc_endpoints_chain_id_status_idx" ON "chain_rpc_endpoints"("chain_id", "status");
CREATE UNIQUE INDEX "chain_rpc_endpoints_scope_provider_key" ON "chain_rpc_endpoints"("organization_id", "project_id", "chain_id", "provider_name", "endpoint_env_key");
CREATE UNIQUE INDEX "chain_feature_support_chain_feature_key" ON "chain_feature_support"("chain_id", "feature_key");
CREATE INDEX "chain_feature_support_feature_key_status_idx" ON "chain_feature_support"("feature_key", "status");
CREATE INDEX "chain_registry_audit_events_organization_id_created_at_idx" ON "chain_registry_audit_events"("organization_id", "created_at");
CREATE INDEX "chain_registry_audit_events_chain_id_created_at_idx" ON "chain_registry_audit_events"("chain_id", "created_at");

ALTER TABLE "chain_explorers" ADD CONSTRAINT "chain_explorers_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "chains"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chain_rpc_endpoints" ADD CONSTRAINT "chain_rpc_endpoints_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "chains"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chain_rpc_endpoints" ADD CONSTRAINT "chain_rpc_endpoints_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chain_rpc_endpoints" ADD CONSTRAINT "chain_rpc_endpoints_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chain_feature_support" ADD CONSTRAINT "chain_feature_support_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "chains"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chain_registry_audit_events" ADD CONSTRAINT "chain_registry_audit_events_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "chains"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chain_registry_audit_events" ADD CONSTRAINT "chain_registry_audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chain_registry_audit_events" ADD CONSTRAINT "chain_registry_audit_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
