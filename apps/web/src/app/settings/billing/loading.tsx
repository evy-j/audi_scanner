import { AppShell } from "@/components/layout/app-shell";

export default function BillingSettingsLoading() {
  return (
    <AppShell>
      <div className="h-8 w-40 animate-pulse rounded-md bg-white/10" />
      <div className="mt-4 h-48 animate-pulse rounded-md bg-white/8" />
    </AppShell>
  );
}
