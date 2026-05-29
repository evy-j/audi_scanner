"use client";

import * as React from "react";
import Link from "next/link";
import { Settings2, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkspaceConfig } from "@/hooks/use-workspace-config";
import { readStoredUser } from "@/lib/workspace-session";
import { hasWorkspaceConfig } from "@/lib/api-client";

export function WorkspaceConfigPanel() {
  const { config, updateConfig } = useWorkspaceConfig();
  const [open, setOpen] = React.useState(false);
  const [user, setUser] = React.useState(readStoredUser());

  React.useEffect(() => {
    const sync = () => setUser(readStoredUser());
    window.addEventListener("audit-scanner:user-updated", sync as EventListener);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("audit-scanner:user-updated", sync as EventListener);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return (
    <div className="relative">
      <Button variant="secondary" onClick={() => setOpen((value) => !value)} aria-label="Workspace configuration">
        <UserCircle2 className="h-4 w-4" />
        <span className="hidden sm:inline">{user?.displayName || user?.email || (hasWorkspaceConfig(config) ? "Workspace" : "Login")}</span>
        <Settings2 className="h-4 w-4 opacity-60" />
      </Button>

      {open ? (
        <Card className="absolute right-0 top-12 z-50 w-[min(92vw,460px)] shadow-panel">
          <CardHeader>
            <CardTitle>Profile & workspace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border border-white/10 bg-white/5 p-3 text-sm">
              <div className="font-medium text-white">{user?.displayName || user?.email || "Not logged in"}</div>
              <div className="mt-1 text-xs text-muted-foreground">{hasWorkspaceConfig(config) ? "Ready to scan" : "Login/signup needed before starting scans"}</div>
            </div>
            <Field label="API URL">
              <Input value={config.apiBaseUrl} onChange={(event) => updateConfig({ apiBaseUrl: event.target.value })} />
            </Field>
            <Field label="Organization ID">
              <Input value={config.organizationId} onChange={(event) => updateConfig({ organizationId: event.target.value })} />
            </Field>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild><Link href="/profile">Open profile</Link></Button>
              <Button asChild variant="secondary"><Link href="/login">Login/signup</Link></Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
