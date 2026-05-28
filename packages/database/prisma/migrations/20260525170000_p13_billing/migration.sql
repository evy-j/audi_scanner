-- Phase P13: billing, subscriptions, payment enforcement, and usage metering.
-- Payment state changes are persisted only from verified provider events or audited manual overrides.

-- Enum values are prepared in 20260525165000_p13_billing_enum_prepare.

CREATE TYPE "BillingProvider" AS ENUM ('DISABLED', 'RAZORPAY', 'STRIPE', 'MANUAL');
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE', 'FAILED');
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'DISPUTED', 'NOT_ASSESSED');
CREATE TYPE "CheckoutStatus" AS ENUM ('CREATED', 'COMPLETED', 'CANCELED', 'EXPIRED', 'PROVIDER_NOT_CONFIGURED', 'FAILED');

CREATE TABLE "billing_plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "slug" VARCHAR(80) NOT NULL,
  "tier" "PlanTier" NOT NULL DEFAULT 'FREE_BETA',
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "monthly_price_minor" INTEGER NOT NULL DEFAULT 0,
  "currency" VARCHAR(12) NOT NULL DEFAULT 'INR',
  "features" JSONB,
  "entitlement_limits" JSONB,
  "contact_sales" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "provider_product_id" VARCHAR(160),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "billing_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_prices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "billing_plan_id" UUID NOT NULL,
  "provider" "BillingProvider" NOT NULL DEFAULT 'DISABLED',
  "provider_price_id" VARCHAR(160),
  "nickname" VARCHAR(120),
  "currency" VARCHAR(12) NOT NULL DEFAULT 'INR',
  "unit_amount_minor" INTEGER NOT NULL DEFAULT 0,
  "interval" VARCHAR(40) NOT NULL DEFAULT 'month',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "billing_prices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscription_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "subscription_id" UUID NOT NULL,
  "billing_plan_id" UUID,
  "billing_price_id" UUID,
  "entitlement_key" VARCHAR(120),
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "status" VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "subscription_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_customers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "provider" "BillingProvider" NOT NULL DEFAULT 'DISABLED',
  "provider_customer_id" VARCHAR(160),
  "email" VARCHAR(320),
  "status" VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "billing_customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "checkout_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "billing_customer_id" UUID,
  "subscription_id" UUID,
  "billing_plan_id" UUID,
  "billing_price_id" UUID,
  "provider" "BillingProvider" NOT NULL DEFAULT 'DISABLED',
  "provider_session_id" VARCHAR(180),
  "status" "CheckoutStatus" NOT NULL DEFAULT 'CREATED',
  "checkout_url" TEXT,
  "currency" VARCHAR(12) NOT NULL DEFAULT 'INR',
  "amount_minor" INTEGER NOT NULL DEFAULT 0,
  "success_url" TEXT,
  "cancel_url" TEXT,
  "created_by_user_id" UUID,
  "completed_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "checkout_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_provider_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "provider" "BillingProvider" NOT NULL,
  "provider_event_id" VARCHAR(180) NOT NULL,
  "event_type" VARCHAR(160) NOT NULL,
  "status" VARCHAR(60) NOT NULL DEFAULT 'NOT_ASSESSED',
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "raw_payload_checksum" VARCHAR(128) NOT NULL,
  "payload_metadata" JSONB,
  "processed_at" TIMESTAMP(3),
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_provider_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "subscription_id" UUID,
  "billing_customer_id" UUID,
  "provider" "BillingProvider" NOT NULL DEFAULT 'DISABLED',
  "provider_invoice_id" VARCHAR(180),
  "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
  "currency" VARCHAR(12) NOT NULL DEFAULT 'INR',
  "subtotal_minor" INTEGER NOT NULL DEFAULT 0,
  "tax_minor" INTEGER NOT NULL DEFAULT 0,
  "total_minor" INTEGER NOT NULL DEFAULT 0,
  "amount_paid_minor" INTEGER NOT NULL DEFAULT 0,
  "hosted_invoice_url" TEXT,
  "receipt_url" TEXT,
  "due_at" TIMESTAMP(3),
  "paid_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_line_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "invoice_id" UUID NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unit_amount_minor" INTEGER NOT NULL DEFAULT 0,
  "amount_minor" INTEGER NOT NULL DEFAULT 0,
  "currency" VARCHAR(12) NOT NULL DEFAULT 'INR',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "subscription_id" UUID,
  "billing_customer_id" UUID,
  "invoice_id" UUID,
  "payment_provider_event_id" UUID,
  "provider" "BillingProvider" NOT NULL DEFAULT 'DISABLED',
  "provider_payment_id" VARCHAR(180),
  "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
  "amount_minor" INTEGER NOT NULL DEFAULT 0,
  "currency" VARCHAR(12) NOT NULL DEFAULT 'INR',
  "receipt_url" TEXT,
  "paid_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "usage_meters" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "entitlement_key" VARCHAR(120) NOT NULL,
  "metric" "UsageMetric",
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "used" INTEGER NOT NULL DEFAULT 0,
  "limit" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "usage_meters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "usage_meter_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "entitlement_key" VARCHAR(120) NOT NULL,
  "event_name" VARCHAR(120) NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "resource_type" VARCHAR(80),
  "resource_id" VARCHAR(128),
  "idempotency_key" VARCHAR(160),
  "reversible" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "usage_meter_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "entitlements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "billing_plan_id" UUID,
  "key" VARCHAR(120) NOT NULL,
  "display_name" VARCHAR(160) NOT NULL,
  "limit" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "reset_period" VARCHAR(40) NOT NULL DEFAULT 'monthly',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "entitlement_grants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "subscription_id" UUID,
  "entitlement_id" UUID,
  "entitlement_key" VARCHAR(120) NOT NULL,
  "source" VARCHAR(60) NOT NULL DEFAULT 'PLAN',
  "limit" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "expires_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  CONSTRAINT "entitlement_grants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_audit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "actor_user_id" UUID,
  "api_key_id" UUID,
  "action" VARCHAR(120) NOT NULL,
  "resource_type" VARCHAR(80) NOT NULL,
  "resource_id" VARCHAR(128),
  "request_id" VARCHAR(120),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_admin_overrides" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "entitlement_key" VARCHAR(120),
  "limit" INTEGER,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'MANUAL_OVERRIDE',
  "reason" TEXT NOT NULL,
  "permanent_confirmed" BOOLEAN NOT NULL DEFAULT false,
  "created_by_user_id" UUID,
  "expires_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "revoked_by_user_id" UUID,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_admin_overrides_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_webhook_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "provider" "BillingProvider" NOT NULL,
  "status" VARCHAR(60) NOT NULL DEFAULT 'NOT_ASSESSED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "event_type" VARCHAR(160),
  "response_status" INTEGER,
  "error_category" VARCHAR(120),
  "metadata" JSONB,
  "delivered_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_plans_slug_key" ON "billing_plans"("slug");
CREATE INDEX "billing_plans_organization_id_active_idx" ON "billing_plans"("organization_id", "active");
CREATE INDEX "billing_plans_tier_active_idx" ON "billing_plans"("tier", "active");
CREATE UNIQUE INDEX "billing_prices_provider_provider_price_id_key" ON "billing_prices"("provider", "provider_price_id");
CREATE INDEX "billing_prices_billing_plan_id_active_idx" ON "billing_prices"("billing_plan_id", "active");
CREATE INDEX "billing_prices_organization_id_active_idx" ON "billing_prices"("organization_id", "active");
CREATE INDEX "subscription_items_organization_id_status_idx" ON "subscription_items"("organization_id", "status");
CREATE INDEX "subscription_items_subscription_id_idx" ON "subscription_items"("subscription_id");
CREATE UNIQUE INDEX "billing_customers_organization_id_key" ON "billing_customers"("organization_id");
CREATE UNIQUE INDEX "billing_customers_provider_provider_customer_id_key" ON "billing_customers"("provider", "provider_customer_id");
CREATE INDEX "billing_customers_provider_status_idx" ON "billing_customers"("provider", "status");
CREATE UNIQUE INDEX "checkout_sessions_provider_provider_session_id_key" ON "checkout_sessions"("provider", "provider_session_id");
CREATE INDEX "checkout_sessions_organization_id_status_created_at_idx" ON "checkout_sessions"("organization_id", "status", "created_at");
CREATE INDEX "checkout_sessions_project_id_status_created_at_idx" ON "checkout_sessions"("project_id", "status", "created_at");
CREATE UNIQUE INDEX "payment_provider_events_provider_provider_event_id_key" ON "payment_provider_events"("provider", "provider_event_id");
CREATE INDEX "payment_provider_events_organization_id_received_at_idx" ON "payment_provider_events"("organization_id", "received_at");
CREATE INDEX "payment_provider_events_provider_event_type_idx" ON "payment_provider_events"("provider", "event_type");
CREATE UNIQUE INDEX "invoices_provider_provider_invoice_id_key" ON "invoices"("provider", "provider_invoice_id");
CREATE INDEX "invoices_organization_id_status_created_at_idx" ON "invoices"("organization_id", "status", "created_at");
CREATE INDEX "invoices_project_id_status_created_at_idx" ON "invoices"("project_id", "status", "created_at");
CREATE INDEX "invoice_line_items_invoice_id_idx" ON "invoice_line_items"("invoice_id");
CREATE INDEX "invoice_line_items_organization_id_created_at_idx" ON "invoice_line_items"("organization_id", "created_at");
CREATE UNIQUE INDEX "payments_provider_provider_payment_id_key" ON "payments"("provider", "provider_payment_id");
CREATE INDEX "payments_organization_id_status_created_at_idx" ON "payments"("organization_id", "status", "created_at");
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");
CREATE UNIQUE INDEX "usage_meters_organization_id_entitlement_key_period_start_key" ON "usage_meters"("organization_id", "entitlement_key", "period_start");
CREATE INDEX "usage_meters_organization_id_period_start_period_end_idx" ON "usage_meters"("organization_id", "period_start", "period_end");
CREATE INDEX "usage_meters_project_id_period_start_idx" ON "usage_meters"("project_id", "period_start");
CREATE UNIQUE INDEX "usage_meter_events_organization_id_idempotency_key_key" ON "usage_meter_events"("organization_id", "idempotency_key");
CREATE INDEX "usage_meter_events_organization_id_entitlement_key_created_at_idx" ON "usage_meter_events"("organization_id", "entitlement_key", "created_at");
CREATE INDEX "usage_meter_events_resource_type_resource_id_idx" ON "usage_meter_events"("resource_type", "resource_id");
CREATE UNIQUE INDEX "entitlements_billing_plan_id_key_key" ON "entitlements"("billing_plan_id", "key");
CREATE INDEX "entitlements_organization_id_key_idx" ON "entitlements"("organization_id", "key");
CREATE INDEX "entitlement_grants_organization_id_entitlement_key_enabled_idx" ON "entitlement_grants"("organization_id", "entitlement_key", "enabled");
CREATE INDEX "entitlement_grants_subscription_id_idx" ON "entitlement_grants"("subscription_id");
CREATE INDEX "billing_audit_events_organization_id_created_at_idx" ON "billing_audit_events"("organization_id", "created_at");
CREATE INDEX "billing_audit_events_resource_type_resource_id_idx" ON "billing_audit_events"("resource_type", "resource_id");
CREATE INDEX "billing_admin_overrides_organization_id_entitlement_key_revoked_at_idx" ON "billing_admin_overrides"("organization_id", "entitlement_key", "revoked_at");
CREATE INDEX "billing_admin_overrides_expires_at_idx" ON "billing_admin_overrides"("expires_at");
CREATE INDEX "billing_webhook_deliveries_organization_id_provider_created_at_idx" ON "billing_webhook_deliveries"("organization_id", "provider", "created_at");

ALTER TABLE "billing_plans" ADD CONSTRAINT "billing_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_prices" ADD CONSTRAINT "billing_prices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_prices" ADD CONSTRAINT "billing_prices_billing_plan_id_fkey" FOREIGN KEY ("billing_plan_id") REFERENCES "billing_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_billing_plan_id_fkey" FOREIGN KEY ("billing_plan_id") REFERENCES "billing_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_billing_price_id_fkey" FOREIGN KEY ("billing_price_id") REFERENCES "billing_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_billing_customer_id_fkey" FOREIGN KEY ("billing_customer_id") REFERENCES "billing_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_billing_plan_id_fkey" FOREIGN KEY ("billing_plan_id") REFERENCES "billing_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_billing_price_id_fkey" FOREIGN KEY ("billing_price_id") REFERENCES "billing_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billing_customer_id_fkey" FOREIGN KEY ("billing_customer_id") REFERENCES "billing_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_billing_customer_id_fkey" FOREIGN KEY ("billing_customer_id") REFERENCES "billing_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_provider_event_id_fkey" FOREIGN KEY ("payment_provider_event_id") REFERENCES "payment_provider_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "usage_meters" ADD CONSTRAINT "usage_meters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "usage_meters" ADD CONSTRAINT "usage_meters_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "usage_meter_events" ADD CONSTRAINT "usage_meter_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "usage_meter_events" ADD CONSTRAINT "usage_meter_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_billing_plan_id_fkey" FOREIGN KEY ("billing_plan_id") REFERENCES "billing_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "entitlement_grants" ADD CONSTRAINT "entitlement_grants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "entitlement_grants" ADD CONSTRAINT "entitlement_grants_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "entitlement_grants" ADD CONSTRAINT "entitlement_grants_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "entitlement_grants" ADD CONSTRAINT "entitlement_grants_entitlement_id_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "entitlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "billing_audit_events" ADD CONSTRAINT "billing_audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_audit_events" ADD CONSTRAINT "billing_audit_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "billing_admin_overrides" ADD CONSTRAINT "billing_admin_overrides_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_admin_overrides" ADD CONSTRAINT "billing_admin_overrides_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "billing_webhook_deliveries" ADD CONSTRAINT "billing_webhook_deliveries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
