-- P14B Chain Adapter, Explorer Verification, and Multi-chain Scan Integration
ALTER TYPE "SourceOriginKind" ADD VALUE IF NOT EXISTS 'EXPLORER_VERIFIED_SOURCE';

DO $$ BEGIN
  CREATE TYPE "ExplorerFetchStatus" AS ENUM ('QUEUED','RUNNING','VERIFIED','NOT_VERIFIED','FAILED','PROVIDER_NOT_CONFIGURED','RATE_LIMITED','NOT_ASSESSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ContractVerificationStatus" AS ENUM ('VERIFIED','NOT_VERIFIED','FAILED','PROVIDER_NOT_CONFIGURED','RATE_LIMITED','NOT_ASSESSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "contract_verifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID,
  "chain_id" UUID NOT NULL,
  "contract_id" UUID,
  "source_artifact_id" UUID,
  "explorer_id" UUID,
  "address" VARCHAR(128) NOT NULL,
  "normalized_address" VARCHAR(128) NOT NULL,
  "status" "ContractVerificationStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  "explorer_provider" VARCHAR(120),
  "contract_name" VARCHAR(180),
  "compiler_version" VARCHAR(160),
  "language" "ContractLanguage" NOT NULL DEFAULT 'UNKNOWN',
  "source_checksum" VARCHAR(128),
  "abi_checksum" VARCHAR(128),
  "proxy_implementation_address" VARCHAR(128),
  "fetched_at" TIMESTAMP(3),
  "error_category" VARCHAR(120),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "contract_verifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "contract_verifications_org_project_created_idx" ON "contract_verifications"("organization_id", "project_id", "created_at");
CREATE INDEX IF NOT EXISTS "contract_verifications_chain_address_status_idx" ON "contract_verifications"("chain_id", "normalized_address", "status");

CREATE TABLE IF NOT EXISTS "contract_source_files" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "project_id" UUID,
  "verification_id" UUID NOT NULL,
  "chain_id" UUID NOT NULL,
  "address" VARCHAR(128) NOT NULL,
  "path" TEXT NOT NULL,
  "checksum" VARCHAR(128) NOT NULL,
  "size_bytes" BIGINT NOT NULL DEFAULT 0,
  "storage_key" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contract_source_files_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "contract_source_files_verification_idx" ON "contract_source_files"("verification_id");
CREATE INDEX IF NOT EXISTS "contract_source_files_chain_address_idx" ON "contract_source_files"("chain_id", "address");

CREATE TABLE IF NOT EXISTS "contract_abis" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "project_id" UUID,
  "verification_id" UUID,
  "chain_id" UUID NOT NULL,
  "address" VARCHAR(128) NOT NULL,
  "normalized_address" VARCHAR(128) NOT NULL,
  "abi" JSONB,
  "abi_checksum" VARCHAR(128),
  "status" "ExplorerFetchStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  "fetched_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contract_abis_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "contract_abis_chain_address_status_idx" ON "contract_abis"("chain_id", "normalized_address", "status");

CREATE TABLE IF NOT EXISTS "explorer_fetch_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "project_id" UUID,
  "chain_id" UUID NOT NULL,
  "explorer_id" UUID,
  "contract_address" VARCHAR(128) NOT NULL,
  "normalized_address" VARCHAR(128) NOT NULL,
  "status" "ExplorerFetchStatus" NOT NULL DEFAULT 'QUEUED',
  "action" VARCHAR(80) NOT NULL,
  "provider_name" VARCHAR(120),
  "http_status" INTEGER,
  "error_category" VARCHAR(120),
  "request_id" VARCHAR(120),
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  "duration_ms" INTEGER,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "explorer_fetch_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "explorer_fetch_runs_org_created_idx" ON "explorer_fetch_runs"("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "explorer_fetch_runs_chain_address_created_idx" ON "explorer_fetch_runs"("chain_id", "normalized_address", "created_at");

CREATE TABLE IF NOT EXISTS "explorer_fetch_artifacts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "fetch_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "artifact_kind" VARCHAR(80) NOT NULL,
  "checksum" VARCHAR(128) NOT NULL,
  "size_bytes" BIGINT NOT NULL DEFAULT 0,
  "storage_key" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "explorer_fetch_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "explorer_fetch_artifacts_run_idx" ON "explorer_fetch_artifacts"("fetch_run_id");
