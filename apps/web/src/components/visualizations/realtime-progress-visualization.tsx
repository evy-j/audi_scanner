"use client";

import { motion } from "framer-motion";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatShortTime, statusPalette } from "@/components/visualizations/chart-theme";
import { useChartReady } from "@/components/visualizations/use-chart-ready";
import { cn } from "@/lib/utils";
import type { ScanProgressEvent } from "@/types/api";

export function RealtimeProgressVisualization({
  events,
  progress,
  status
}: {
  events: ScanProgressEvent[];
  progress: number;
  status: string;
}) {
  const ready = useChartReady();
  const data = events.slice(-24).map((event) => ({
    sequence: event.sequence,
    label: formatShortTime(event.emittedAt),
    progress: Math.round(event.progress),
    status: event.status
  }));
  const color = statusPalette[status] ?? "#38bdf8";

  return (
    <motion.div
      className="grid gap-4 lg:grid-cols-[170px_1fr]"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex items-center justify-center">
        <div className="relative h-36 w-36">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(${color} ${Math.max(0, Math.min(100, progress))}%, rgba(255,255,255,0.08) 0)`
            }}
          />
          <div className="absolute inset-2 rounded-full bg-slate-950/95" />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-3xl font-semibold text-white">{Math.round(progress)}%</div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{status}</div>
          </div>
        </div>
      </div>

      <div className="h-44 min-w-0">
        {ready && data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
              <defs>
                <linearGradient id="liveProgressArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
              <Tooltip content={<ProgressTooltip />} cursor={{ stroke: "rgba(56, 189, 248, 0.35)" }} />
              <Area type="monotone" dataKey="progress" stroke={color} strokeWidth={2} fill="url(#liveProgressArea)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-white/10 text-sm text-muted-foreground">
            Waiting for telemetry samples
          </div>
        )}
      </div>

      <div className="lg:col-span-2">
        <div className="grid gap-2 sm:grid-cols-4">
          {["QUEUED", "RUNNING", "SCORING", "COMPLETED"].map((phase) => (
            <div
              key={phase}
              className={cn(
                "rounded-md border p-3 text-xs transition",
                phase === status ? "border-primary/40 bg-primary/10 text-white shadow-glow" : "border-white/10 bg-white/6 text-muted-foreground"
              )}
            >
              {phase}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function ProgressTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: { status?: string; sequence?: number } }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0];
  if (!item) {
    return null;
  }

  return (
    <div className="rounded-md border border-white/10 bg-slate-950/95 px-3 py-2 text-xs shadow-glow backdrop-blur">
      <div className="font-medium text-white">{label}</div>
      <div className="mt-1 text-muted-foreground">Progress {item.value ?? 0}%</div>
      <div className="text-muted-foreground">{item.payload?.status ?? "unknown"} #{item.payload?.sequence ?? 0}</div>
    </div>
  );
}
