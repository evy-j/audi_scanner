-- P2A evidence review workflow and audit operations layer.

-- CreateEnum
CREATE TYPE "FindingReviewStatus" AS ENUM (
  'UNREVIEWED',
  'NEEDS_REVIEW',
  'ACCEPTED',
  'FALSE_POSITIVE',
  'RISK_ACCEPTED',
  'FIXED',
  'WONT_FIX',
  'DUPLICATE',
  'SUPPRESSED'
);

-- CreateEnum
CREATE TYPE "FindingReviewAction" AS ENUM (
  'STATUS_CHANGED',
  'COMMENT_ADDED',
  'ASSIGNED',
  'SUPPRESSED',
  'UNSUPPRESSED',
  'SEVERITY_OVERRIDDEN',
  'CONFIDENCE_OVERRIDDEN',
  'BASELINE_MARKED',
  'EXPORT_REQUESTED'
);

-- CreateTable
CREATE TABLE "projects" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "slug" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "status" "AccessStatus" NOT NULL DEFAULT 'ACTIVE',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "scans" ADD COLUMN "project_id" UUID;

-- CreateTable
CREATE TABLE "finding_suppression_rules" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "created_by_user_id" UUID,
  "analyzer_name" VARCHAR(80),
  "rule_id" VARCHAR(160),
  "file_path" TEXT,
  "function_name" VARCHAR(160),
  "fingerprint" VARCHAR(160),
  "severity" "VulnerabilitySeverity",
  "message_contains" TEXT,
  "reason" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "finding_suppression_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding_reviews" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "status" "FindingReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
  "status_before_suppression" "FindingReviewStatus",
  "severity_override" "VulnerabilitySeverity",
  "confidence_override" "VulnerabilityConfidence",
  "suppression_rule_id" UUID,
  "assigned_to_name" VARCHAR(160),
  "assigned_to_email" VARCHAR(320),
  "assigned_to_team" VARCHAR(160),
  "last_reviewed_by_user_id" UUID,
  "last_reviewed_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "finding_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding_review_events" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "review_id" UUID,
  "actor_user_id" UUID,
  "action" "FindingReviewAction" NOT NULL,
  "previous_value" JSONB,
  "new_value" JSONB,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "finding_review_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding_baselines" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "scan_id" UUID NOT NULL,
  "base_scan_id" UUID,
  "finding_id" UUID,
  "base_finding_id" UUID,
  "fingerprint" VARCHAR(160) NOT NULL,
  "baseline_status" VARCHAR(40) NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "finding_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding_comments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "review_id" UUID,
  "actor_user_id" UUID,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "finding_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding_assignments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "review_id" UUID,
  "actor_user_id" UUID,
  "assignee_user_id" UUID,
  "assignee_name" VARCHAR(160),
  "assignee_email" VARCHAR(320),
  "assignee_team" VARCHAR(160),
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "finding_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_owner_rules" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "created_by_user_id" UUID,
  "path_pattern" TEXT NOT NULL,
  "owner_name" VARCHAR(160),
  "owner_email" VARCHAR(320),
  "owner_team" VARCHAR(160),
  "severity_threshold" "VulnerabilitySeverity",
  "active" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "code_owner_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_organization_id_slug_key" ON "projects"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "projects_organization_id_status_created_at_idx" ON "projects"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "scans_project_id_status_created_at_idx" ON "scans"("project_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "finding_reviews_finding_id_key" ON "finding_reviews"("finding_id");

-- CreateIndex
CREATE INDEX "finding_reviews_organization_id_project_id_status_idx" ON "finding_reviews"("organization_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "finding_reviews_scan_id_status_idx" ON "finding_reviews"("scan_id", "status");

-- CreateIndex
CREATE INDEX "finding_review_events_finding_id_created_at_idx" ON "finding_review_events"("finding_id", "created_at");

-- CreateIndex
CREATE INDEX "finding_review_events_scan_id_created_at_idx" ON "finding_review_events"("scan_id", "created_at");

-- CreateIndex
CREATE INDEX "finding_review_events_project_id_action_created_at_idx" ON "finding_review_events"("project_id", "action", "created_at");

-- CreateIndex
CREATE INDEX "finding_suppression_rules_project_id_active_idx" ON "finding_suppression_rules"("project_id", "active");

-- CreateIndex
CREATE INDEX "finding_suppression_rules_organization_id_project_id_created_at_idx" ON "finding_suppression_rules"("organization_id", "project_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "finding_baselines_scan_id_fingerprint_baseline_status_key" ON "finding_baselines"("scan_id", "fingerprint", "baseline_status");

-- CreateIndex
CREATE INDEX "finding_baselines_project_id_baseline_status_idx" ON "finding_baselines"("project_id", "baseline_status");

-- CreateIndex
CREATE INDEX "finding_comments_finding_id_created_at_idx" ON "finding_comments"("finding_id", "created_at");

-- CreateIndex
CREATE INDEX "finding_assignments_finding_id_created_at_idx" ON "finding_assignments"("finding_id", "created_at");

-- CreateIndex
CREATE INDEX "finding_assignments_project_id_assignee_email_idx" ON "finding_assignments"("project_id", "assignee_email");

-- CreateIndex
CREATE INDEX "code_owner_rules_project_id_active_idx" ON "code_owner_rules"("project_id", "active");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_suppression_rules" ADD CONSTRAINT "finding_suppression_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_suppression_rules" ADD CONSTRAINT "finding_suppression_rules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_reviews" ADD CONSTRAINT "finding_reviews_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_reviews" ADD CONSTRAINT "finding_reviews_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_reviews" ADD CONSTRAINT "finding_reviews_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_reviews" ADD CONSTRAINT "finding_reviews_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_reviews" ADD CONSTRAINT "finding_reviews_suppression_rule_id_fkey" FOREIGN KEY ("suppression_rule_id") REFERENCES "finding_suppression_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_review_events" ADD CONSTRAINT "finding_review_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_review_events" ADD CONSTRAINT "finding_review_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_review_events" ADD CONSTRAINT "finding_review_events_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_review_events" ADD CONSTRAINT "finding_review_events_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_review_events" ADD CONSTRAINT "finding_review_events_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "finding_reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_baselines" ADD CONSTRAINT "finding_baselines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_baselines" ADD CONSTRAINT "finding_baselines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_baselines" ADD CONSTRAINT "finding_baselines_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_comments" ADD CONSTRAINT "finding_comments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_comments" ADD CONSTRAINT "finding_comments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_comments" ADD CONSTRAINT "finding_comments_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_comments" ADD CONSTRAINT "finding_comments_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_comments" ADD CONSTRAINT "finding_comments_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "finding_reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_assignments" ADD CONSTRAINT "finding_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_assignments" ADD CONSTRAINT "finding_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_assignments" ADD CONSTRAINT "finding_assignments_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_assignments" ADD CONSTRAINT "finding_assignments_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_assignments" ADD CONSTRAINT "finding_assignments_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "finding_reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_owner_rules" ADD CONSTRAINT "code_owner_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_owner_rules" ADD CONSTRAINT "code_owner_rules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
