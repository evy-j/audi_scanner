"use client";

import { Activity, Radio } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RealtimeProgressVisualization } from "@/components/visualizations";
import { useLiveScanProgress } from "@/hooks/use-live-scan-progress";
import type { WorkspaceConfig } from "@/lib/api-client";
import { formatDateTime } from "@/lib/utils";

export function LiveProgressPanel({
  config,
  scanId
}: {
  config: WorkspaceConfig;
  scanId?: string | null;
}) {
  const live = useLiveScanProgress(config, scanId);

  return (
    <Card className="scanline">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Live scan progress</CardTitle>
          <Badge variant={live.status === "open" ? "default" : "neutral"}>
            <Radio className="mr-1 h-3 w-3" />
            {live.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <RealtimeProgressVisualization events={live.events} progress={live.progress} status={live.scanStatus} />

        <div className="mb-5 mt-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{live.scanStatus}</span>
            <span className="font-medium text-white">{Math.round(live.progress)}%</span>
          </div>
          <Progress value={live.progress} />
        </div>

        <div className="max-h-[420px] space-y-3 overflow-auto pr-1">
          {live.events.map((event) => (
            <div key={event.eventId} className="rounded-md border border-white/10 bg-white/6 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Activity className="h-4 w-4 shrink-0 text-primary" />
                  <div className="truncate text-sm font-medium text-white">{event.message}</div>
                </div>
                <div className="text-xs text-muted-foreground">#{event.sequence}</div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">{formatDateTime(event.emittedAt)}</div>
            </div>
          ))}
          {live.events.length === 0 ? (
            <div className="rounded-md border border-dashed border-white/10 p-8 text-center text-sm text-muted-foreground">
              Waiting for scan telemetry
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
