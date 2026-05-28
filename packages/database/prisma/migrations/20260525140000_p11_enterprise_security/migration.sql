-- Phase P11: enterprise security controls, tenant isolation, access governance.

CREATE TYPE "EnterpriseRoleType" AS ENUM (
  'OWNER',
  'ADMIN',
  'SECURITY_LEAD',
  'AUDITOR',
  'DEVELOPER',
  'VIEWER',
  'BILLING_ADMIN',
  'READONLY'
);

CREATE TYPE "TeamMemberStatus" AS ENUM ('ACTIVE', 'REMOVED');
CREATE TYPE "ProjectMemberStatus" AS ENUM ('ACTIVE', 'REMOVED');
CREATE TYPE "ApiKeyAuditAction" AS ENUM ('CREATED', 'USED', 'REVOKED', 'DENIED');
CREATE TYPE "AccessAuditDecision" AS ENUM ('ALLOWED', 'DENIED');
CREATE TYPE "DataRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED', 'CANCELED');
CREATE TYPE "SsoProviderKind" AS ENUM ('OIDC', 'SAML');
CREATE TYPE "SsoConnectionStatus" AS ENUM ('NOT_CONFIGURED', 'CONFIGURED_NOT_ACTIVE', 'ACTIVE', 'DISABLED', 'ERROR');

ALTER TABLE "organization_members"
  ADD COLUMN "role_type" "EnterpriseRoleType" NOT NULL DEFAULT 'VIEWER',
  ADD COLUMN "invited_email" VARCHAR(320),
  ADD COLUMN "invited_by_user_id" UUID;

ALTER TABLE "roles"
  ADD COLUMN "role_type" "EnterpriseRoleType" NOT NULL DEFAULT 'VIEWER';

ALTER TABLE "api_keys"
  ADD COLUMN "project_id" UUID;

CREATE INDEX "api_keys_project_id_status_idx" ON "api_keys"("project_id", "status");
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "teams" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "name" VARCHAR(160) NOT NULL,
  "slug" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "status" "AccessStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "team_members" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "team_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role_type" "EnterpriseRoleType" NOT NULL DEFAULT 'DEVELOPER',
  "status" "TeamMemberStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_members" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role_type" "EnterpriseRoleType" NOT NULL DEFAULT 'DEVELOPER',
  "status" "ProjectMemberStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "api_key_audit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "api_key_id" UUID,
  "actor_user_id" UUID,
  "action" "ApiKeyAuditAction" NOT NULL,
  "key_prefix" VARCHAR(32),
  "ip_hash" VARCHAR(128),
  "user_agent_hash" VARCHAR(128),
  "request_id" VARCHAR(160),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "api_key_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "access_audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "project_id" UUID,
  "actor_user_id" UUID,
  "api_key_id" UUID,
  "decision" "AccessAuditDecision" NOT NULL,
  "action" VARCHAR(160) NOT NULL,
  "resource_type" VARCHAR(120) NOT NULL,
  "resource_id" VARCHAR(128),
  "ip_hash" VARCHAR(128),
  "user_agent_hash" VARCHAR(128),
  "request_id" VARCHAR(160),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "access_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_retention_policies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "scan_artifact_retention_days" INTEGER NOT NULL DEFAULT 90,
  "report_retention_days" INTEGER NOT NULL DEFAULT 365,
  "audit_log_retention_days" INTEGER NOT NULL DEFAULT 365,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "data_retention_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_export_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "requested_by_id" UUID,
  "status" "DataRequestStatus" NOT NULL DEFAULT 'PENDING',
  "scope" VARCHAR(80) NOT NULL DEFAULT 'ORGANIZATION',
  "artifact_path" TEXT,
  "checksum_sha256" VARCHAR(128),
  "reason" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "data_export_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_deletion_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "requested_by_id" UUID,
  "status" "DataRequestStatus" NOT NULL DEFAULT 'PENDING',
  "scope" VARCHAR(80) NOT NULL DEFAULT 'ORGANIZATION',
  "reason" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "data_deletion_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sso_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "provider_kind" "SsoProviderKind" NOT NULL DEFAULT 'OIDC',
  "status" "SsoConnectionStatus" NOT NULL DEFAULT 'CONFIGURED_NOT_ACTIVE',
  "issuer_url" TEXT,
  "client_id" VARCHAR(240),
  "client_secret_hash" VARCHAR(255),
  "allowed_domains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "sso_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sso_login_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "user_id" UUID,
  "email_hash" VARCHAR(128),
  "provider_kind" "SsoProviderKind" NOT NULL DEFAULT 'OIDC',
  "status" "SsoConnectionStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
  "ip_hash" VARCHAR(128),
  "user_agent_hash" VARCHAR(128),
  "request_id" VARCHAR(160),
  "error_category" VARCHAR(120),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sso_login_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "security_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "require_2fa" BOOLEAN NOT NULL DEFAULT false,
  "session_timeout_minutes" INTEGER NOT NULL DEFAULT 480,
  "allowed_domains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "api_key_max_lifetime_days" INTEGER NOT NULL DEFAULT 90,
  "public_report_sharing_allowed" BOOLEAN NOT NULL DEFAULT true,
  "webhook_allowed" BOOLEAN NOT NULL DEFAULT true,
  "simulation_allowed" BOOLEAN NOT NULL DEFAULT true,
  "fuzzing_allowed" BOOLEAN NOT NULL DEFAULT true,
  "monitoring_allowed" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "security_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_action_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "project_id" UUID,
  "actor_user_id" UUID,
  "action" VARCHAR(160) NOT NULL,
  "resource_type" VARCHAR(120) NOT NULL,
  "resource_id" VARCHAR(128),
  "ip_hash" VARCHAR(128),
  "user_agent_hash" VARCHAR(128),
  "request_id" VARCHAR(160),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_action_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "teams_organization_id_slug_key" ON "teams"("organization_id", "slug");
CREATE INDEX "teams_organization_id_status_idx" ON "teams"("organization_id", "status");
CREATE INDEX "teams_project_id_status_idx" ON "teams"("project_id", "status");
CREATE UNIQUE INDEX "team_members_team_id_user_id_key" ON "team_members"("team_id", "user_id");
CREATE INDEX "team_members_organization_id_status_idx" ON "team_members"("organization_id", "status");
CREATE INDEX "team_members_user_id_status_idx" ON "team_members"("user_id", "status");
CREATE UNIQUE INDEX "project_members_project_id_user_id_key" ON "project_members"("project_id", "user_id");
CREATE INDEX "project_members_organization_id_status_idx" ON "project_members"("organization_id", "status");
CREATE INDEX "project_members_user_id_status_idx" ON "project_members"("user_id", "status");
CREATE INDEX "api_key_audit_events_organization_id_created_at_idx" ON "api_key_audit_events"("organization_id", "created_at");
CREATE INDEX "api_key_audit_events_api_key_id_created_at_idx" ON "api_key_audit_events"("api_key_id", "created_at");
CREATE INDEX "access_audit_logs_organization_id_created_at_idx" ON "access_audit_logs"("organization_id", "created_at");
CREATE INDEX "access_audit_logs_actor_user_id_created_at_idx" ON "access_audit_logs"("actor_user_id", "created_at");
CREATE INDEX "access_audit_logs_decision_created_at_idx" ON "access_audit_logs"("decision", "created_at");
CREATE UNIQUE INDEX "data_retention_policies_organization_id_key" ON "data_retention_policies"("organization_id");
CREATE INDEX "data_export_requests_organization_id_status_created_at_idx" ON "data_export_requests"("organization_id", "status", "created_at");
CREATE INDEX "data_deletion_requests_organization_id_status_created_at_idx" ON "data_deletion_requests"("organization_id", "status", "created_at");
CREATE INDEX "sso_connections_organization_id_status_idx" ON "sso_connections"("organization_id", "status");
CREATE INDEX "sso_login_attempts_organization_id_created_at_idx" ON "sso_login_attempts"("organization_id", "created_at");
CREATE INDEX "sso_login_attempts_email_hash_created_at_idx" ON "sso_login_attempts"("email_hash", "created_at");
CREATE UNIQUE INDEX "security_settings_organization_id_key" ON "security_settings"("organization_id");
CREATE INDEX "admin_action_events_organization_id_created_at_idx" ON "admin_action_events"("organization_id", "created_at");
CREATE INDEX "admin_action_events_resource_type_resource_id_idx" ON "admin_action_events"("resource_type", "resource_id");

ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teams" ADD CONSTRAINT "teams_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_key_audit_events" ADD CONSTRAINT "api_key_audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_key_audit_events" ADD CONSTRAINT "api_key_audit_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "api_key_audit_events" ADD CONSTRAINT "api_key_audit_events_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "api_key_audit_events" ADD CONSTRAINT "api_key_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "access_audit_logs" ADD CONSTRAINT "access_audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "access_audit_logs" ADD CONSTRAINT "access_audit_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "access_audit_logs" ADD CONSTRAINT "access_audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "data_retention_policies" ADD CONSTRAINT "data_retention_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "data_deletion_requests" ADD CONSTRAINT "data_deletion_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_deletion_requests" ADD CONSTRAINT "data_deletion_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "data_deletion_requests" ADD CONSTRAINT "data_deletion_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sso_connections" ADD CONSTRAINT "sso_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sso_login_attempts" ADD CONSTRAINT "sso_login_attempts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sso_login_attempts" ADD CONSTRAINT "sso_login_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "security_settings" ADD CONSTRAINT "security_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_action_events" ADD CONSTRAINT "admin_action_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "admin_action_events" ADD CONSTRAINT "admin_action_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "admin_action_events" ADD CONSTRAINT "admin_action_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
