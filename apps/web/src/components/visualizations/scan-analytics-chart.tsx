"use client";

import { motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { statusPalette } from "@/components/visualizations/chart-theme";
import { ChartPlaceholder, useChartReady } from "@/components/visualizations/use-chart-ready";
import { toNumber } from "@/lib/utils";
import type { Scan } from "@/types/api";

export function ScanAnalyticsChart({ scans }: { scans: Scan[] }) {
  const ready = useChartReady();
  const data = createStatusData(scans);

  if (!ready) {
    return <ChartPlaceholder className="h-64 w-full" />;
  }

  return (
    <motion.div
      className="h-64 w-full"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <BarChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
          <XAxis dataKey="status" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
          <Tooltip content={<ScanAnalyticsTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="count" name="Scans" radius={[6, 6, 0, 0]} fill="#38bdf8" />
          <Bar dataKey="highRisk" name="High risk" radius={[6, 6, 0, 0]} fill="#fb7185" />
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

function createStatusData(scans: Scan[]) {
  const groups = new Map<string, { status: string; count: number; highRisk: number; totalRisk: number; fill: string }>();

  scans.forEach((scan) => {
    const current = groups.get(scan.status) ?? {
      status: scan.status,
      count: 0,
      highRisk: 0,
      totalRisk: 0,
      fill: statusPalette[scan.status] ?? "#38bdf8"
    };
    const risk = toNumber(scan.riskScore);
    current.count += 1;
    current.highRisk += risk >= 70 ? 1 : 0;
    current.totalRisk += risk;
    groups.set(scan.status, current);
  });

  return Array.from(groups.values())
    .map((item) => ({
      ...item,
      averageRisk: item.count > 0 ? Math.round(item.totalRisk / item.count) : 0
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 8);
}

function ScanAnalyticsTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number; payload?: { averageRisk?: number } }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const count = payload.find((item) => item.dataKey === "count")?.value ?? 0;
  const highRisk = payload.find((item) => item.dataKey === "highRisk")?.value ?? 0;
  const averageRisk = payload[0]?.payload?.averageRisk ?? 0;

  return (
    <div className="rounded-md border border-white/10 bg-slate-950/95 px-3 py-2 text-xs shadow-glow backdrop-blur">
      <div className="font-medium text-white">{label}</div>
      <div className="mt-1 text-muted-foreground">Scans {count}</div>
      <div className="text-muted-foreground">High risk {highRisk}</div>
      <div className="text-muted-foreground">Average risk {averageRisk}</div>
    </div>
  );
}
