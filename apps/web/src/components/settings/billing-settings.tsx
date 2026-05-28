"use client";

import * as React from "react";
import { CreditCard, FileText, Gauge, ReceiptText, ShieldCheck, type LucideIcon } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuditScannerApiClient, hasWorkspaceConfig } from "@/lib/api-client";
import { useWorkspaceConfig } from "@/hooks/use-workspace-config";
import type { BillingPlan, BillingPlansResponse, BillingSubscriptionResponse } from "@/types/api";

export function BillingSettings() {
  const { config } = useWorkspaceConfig();
  const [plans, setPlans] = React.useState<BillingPlansResponse | null>(null);
  const [subscription, setSubscription] = React.useState<BillingSubscriptionResponse | null>(null);
  const [invoices, setInvoices] = React.useState<Array<Record<string, unknown>>>([]);
  const [payments, setPayments] = React.useState<Array<Record<string, unknown>>>([]);
  const [message, setMessage] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!hasWorkspaceConfig(config)) return;
    const client = new AuditScannerApiClient(config);
    const [planResult, subscriptionResult, invoiceResult, paymentResult] = await Promise.allSettled([
      client.listBillingPlans(),
      client.getBillingSubscription(),
      client.listBillingInvoices(),
      client.listBillingPayments()
    ]);
    setPlans(planResult.status === "fulfilled" ? planResult.value : null);
    setSubscription(subscriptionResult.status === "fulfilled" ? subscriptionResult.value : null);
    setInvoices(invoiceResult.status === "fulfilled" ? invoiceResult.value.invoices : []);
    setPayments(paymentResult.status === "fulfilled" ? paymentResult.value.payments : []);
    const denied = [planResult, subscriptionResult, invoiceResult, paymentResult].find((item) => item.status === "rejected");
    setMessage(denied ? "Permission denied or billing data is unavailable for this workspace." : null);
  }, [config]);

  React.useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load billing settings"));
  }, [load]);

  const checkout = async (plan: BillingPlan) => {
    if (!hasWorkspaceConfig(config)) return;
    const price = plan.prices?.find((item) => item.active);
    const result = await new AuditScannerApiClient(config).createBillingCheckout({
      planId: plan.id,
      ...(price?.id ? { priceId: price.id } : {})
    });
    setMessage(result.checkoutUrl ? "Checkout session created by provider." : result.message ?? result.status);
    if (result.checkoutUrl) {
      window.location.assign(result.checkoutUrl);
    } else {
      await load();
    }
  };

  const billing = subscription?.billing ?? plans?.billing;
  const usage = subscription?.usage;

  return (
    <AppShell>
      <div className="mb-6">
        <Badge variant="blue" className="mb-3">Billing</Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Plans and usage</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Subscription, usage, entitlement, invoice, and payment state from persisted billing records only.
        </p>
      </div>

      {message ? <div className="mb-4 rounded-md border border-white/10 bg-white/8 p-3 text-sm text-slate-200">{message}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader><CardTitle>Current subscription</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <StatusRow icon={CreditCard} title={subscription?.subscription.status ?? "Not assessed"} detail={subscription?.subscription.provider ?? "No provider"} />
            <StatusRow icon={ShieldCheck} title={billing?.message ?? "Billing provider not configured"} detail={`Provider: ${billing?.provider ?? "DISABLED"} / test mode: ${billing?.testMode ? "on" : "off"}`} />
            {subscription?.manualOverrides.length ? (
              <div className="rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
                Manual override active. This does not claim payment was received.
              </div>
            ) : null}
            {billing && !billing.configured ? (
              <div className="rounded-md border border-white/10 bg-white/6 p-3 text-sm text-muted-foreground">
                Provider Not Configured. Checkout will not produce a fake payment URL.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Usage meters</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {usage?.counters.map((counter) => (
              <div key={counter.metric} className="rounded-md border border-white/10 bg-white/6 p-3">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-white">{counter.metric}</span>
                  <span className="text-muted-foreground">{counter.limit < 0 ? `${counter.used}/unlimited` : `${counter.used}/${counter.limit}`}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-primary" style={{ width: `${counter.limit <= 0 ? 0 : Math.min(100, (counter.used / counter.limit) * 100)}%` }} />
                </div>
              </div>
            ))}
            {!usage?.counters.length ? <Empty label="No usage meters returned." /> : null}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>Plan catalog</CardTitle></CardHeader>
        <CardContent className="grid gap-3 xl:grid-cols-4">
          {plans?.plans.map((plan) => (
            <div key={plan.id} className="rounded-md border border-white/10 bg-white/6 p-4">
              <div className="mb-1 text-base font-semibold text-white">{plan.name}</div>
              <div className="min-h-10 text-sm text-muted-foreground">{plan.description ?? "No description persisted."}</div>
              <div className="my-4 text-2xl font-semibold text-white">
                {plan.contactSales ? "Contact sales" : money(plan.monthlyPriceMinor, plan.currency)}
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                {(plan.entitlements ?? []).slice(0, 6).map((item) => (
                  <div key={item.id}>{item.key}: {item.limit < 0 ? "unlimited" : item.limit}</div>
                ))}
              </div>
              <Button className="mt-4 w-full" variant={plan.contactSales ? "secondary" : "default"} onClick={() => void checkout(plan)} disabled={plan.contactSales}>
                {plan.contactSales ? "Manual setup" : "Checkout"}
              </Button>
            </div>
          ))}
          {!plans?.plans.length ? <Empty label="No billing plans persisted. Run npm run billing:seed." /> : null}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {invoices.slice(0, 8).map((invoice) => (
              <StatusRow key={String(invoice.id)} icon={FileText} title={String(invoice.status ?? "NOT_ASSESSED")} detail={String(invoice.providerInvoiceId ?? invoice.id)} />
            ))}
            {invoices.length === 0 ? <Empty label="No invoices persisted." /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {payments.slice(0, 8).map((payment) => (
              <StatusRow key={String(payment.id)} icon={ReceiptText} title={String(payment.status ?? "NOT_ASSESSED")} detail={String(payment.providerPaymentId ?? payment.id)} />
            ))}
            {payments.length === 0 ? <Empty label="No payments persisted." /> : null}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function StatusRow({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-white/10 bg-white/6 p-3">
      <Icon className="mt-0.5 h-4 w-4 text-primary" />
      <div>
        <div className="text-sm font-medium text-white">{title}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="rounded-md border border-white/10 bg-white/6 p-3 text-sm text-muted-foreground">{label}</div>;
}

function money(minor: number, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(minor / 100);
}
