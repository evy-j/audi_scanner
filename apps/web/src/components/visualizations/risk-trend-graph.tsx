"use client";

import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { createRiskTrend } from "@/components/visualizations/chart-theme";
import { ChartPlaceholder, useChartReady } from "@/components/visualizations/use-chart-ready";
import type { Scan } from "@/types/api";

export function RiskTrendGraph({ scans }: { scans: Scan[] }) {
  const ready = useChartReady();
  const data = createRiskTrend(scans);

  if (!ready) {
    return <ChartPlaceholder className="h-72 w-full" />;
  }

  return (
    <motion.div
      className="h-72 w-full"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <AreaChart data={data} margin={{ top: 12, right: 10, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="riskArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb7185" stopOpacity={0.42} />
              <stop offset="60%" stopColor="#38bdf8" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
          <ReferenceLine y={70} stroke="#fb7185" strokeDasharray="4 4" strokeOpacity={0.5} />
          <Tooltip content={<RiskTooltip />} cursor={{ stroke: "rgba(56, 189, 248, 0.35)", strokeWidth: 1 }} />
          <Area type="monotone" dataKey="risk" stroke="#38bdf8" strokeWidth={2.5} fill="url(#riskArea)" activeDot={{ r: 5 }} />
          <Line type="monotone" dataKey="progress" stroke="#34d399" strokeWidth={1.6} dot={false} strokeOpacity={0.75} />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

function RiskTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const risk = payload.find((item) => item.dataKey === "risk")?.value ?? 0;
  const progress = payload.find((item) => item.dataKey === "progress")?.value ?? 0;

  return (
    <div className="rounded-md border border-white/10 bg-slate-950/95 px-3 py-2 text-xs shadow-glow backdrop-blur">
      <div className="font-medium text-white">{label}</div>
      <div className="mt-1 text-muted-foreground">Risk {risk}</div>
      <div className="text-muted-foreground">Progress {progress}%</div>
    </div>
  );
}
