"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AuditScannerApiClient, hasWorkspaceConfig } from "@/lib/api-client";
import { useWorkspaceConfig } from "@/hooks/use-workspace-config";

export default function AuditorPage() {
  const { config } = useWorkspaceConfig();
  const [scanId, setScanId] = React.useState("");
  const [findingId, setFindingId] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [output, setOutput] = React.useState<string>("Manual auditor workflow is ready. Load a scan review summary or update a finding review.");
  const client = React.useMemo(() => (hasWorkspaceConfig(config) ? new AuditScannerApiClient(config) : null), [config]);

  const loadSummary = async () => {
    if (!client || !scanId) return;
    const summary = await client.getReviewSummary(scanId);
    setOutput(JSON.stringify(summary, null, 2));
  };

  const markFalsePositive = async () => {
    if (!client || !findingId) return;
    const review = await client.updateFindingReviewStatus(findingId, { status: "FALSE_POSITIVE", reason: reason || "Marked from manual auditor workflow" });
    await client.createFalsePositiveFeedback(findingId, { reason: reason || "Manual auditor marked this finding as false positive", reviewerNotes: reason });
    setOutput(JSON.stringify(review, null, 2));
  };

  const markConfirmed = async () => {
    if (!client || !findingId) return;
    const review = await client.updateFindingReviewStatus(findingId, { status: "ACCEPTED", reason: reason || "Accepted by manual auditor" });
    setOutput(JSON.stringify(review, null, 2));
  };

  return (
    <AppShell>
      <div className="mb-6">
        <Badge variant="blue" className="mb-3">Manual auditor workflow</Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Human review queue</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Confirm findings, mark false positives, and keep an evidence trail. This is the human gate before anything is treated as production security truth.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader><CardTitle>Review actions</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Field label="Scan ID"><Input value={scanId} onChange={(event) => setScanId(event.target.value)} /></Field>
            <Button variant="secondary" onClick={() => void loadSummary()} disabled={!scanId}>Load review summary</Button>
            <Field label="Finding ID"><Input value={findingId} onChange={(event) => setFindingId(event.target.value)} /></Field>
            <Field label="Reason / reviewer notes"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void markConfirmed()} disabled={!findingId}>Mark accepted</Button>
              <Button variant="secondary" onClick={() => void markFalsePositive()} disabled={!findingId}>Mark false positive</Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Evidence output</CardTitle></CardHeader>
          <CardContent>
            <pre className="max-h-[560px] overflow-auto rounded-md bg-black/30 p-4 text-xs leading-5 text-slate-200">{output}</pre>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>{children}</label>;
}
