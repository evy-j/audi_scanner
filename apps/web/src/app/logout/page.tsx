"use client";

import * as React from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuditScannerApiClient } from "@/lib/api-client";
import { useWorkspaceConfig } from "@/hooks/use-workspace-config";

const refreshKey = "audit-scanner.refresh-token";

export default function LogoutPage() {
  const { config, updateConfig } = useWorkspaceConfig();
  const [message, setMessage] = React.useState("Ready to logout from this browser.");

  const logout = async () => {
    const refreshToken = window.localStorage.getItem(refreshKey) ?? undefined;
    if (config.accessToken) {
      await new AuditScannerApiClient(config).logout(refreshToken).catch(() => undefined);
    }
    window.localStorage.removeItem(refreshKey);
    updateConfig({ accessToken: "" });
    setMessage("Logged out locally. Token removed from this browser.");
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-xl">
        <Card>
          <CardHeader><CardTitle>Logout</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-slate-300">{message}</div>
            <Button onClick={() => void logout()}><LogOut className="h-4 w-4" />Logout</Button>
            <div><Link href="/login" className="text-sm text-sky-300">Back to login</Link></div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
