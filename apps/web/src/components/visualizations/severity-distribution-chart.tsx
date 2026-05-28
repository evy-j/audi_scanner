"use client";

import { motion } from "framer-motion";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { severityLabel, severityPalette, type SeverityCounts } from "@/components/visualizations/chart-theme";
import { ChartPlaceholder, useChartReady } from "@/components/visualizations/use-chart-ready";

const severityOrder = [
  { key: "critical", severity: "CRITICAL" },
  { key: "high", severity: "HIGH" },
  { key: "medium", severity: "MEDIUM" },
  { key: "low", severity: "LOW" },
  { key: "informational", severity: "INFORMATIONAL" }
] as const;

export function SeverityDistributionChart({ counts }: { counts: SeverityCounts }) {
  const ready = useChartReady();
  const data = severityOrder.map((item) => ({
    key: item.key,
    label: severityLabel(item.key),
    value: counts[item.key],
    fill: severityPalette[item.severity]
  }));
  const total = data.reduce((sum, item) => sum + item.value, 0);

  if (!ready) {
    return <ChartPlaceholder className="h-56 w-full" />;
  }

  return (
    <motion.div
      className="grid gap-4 lg:grid-cols-[220px_1fr]"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="relative h-56 min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <PieChart>
            <Tooltip content={<SeverityTooltip />} cursor={false} />
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="82%"
              paddingAngle={3}
              stroke="rgba(15, 23, 42, 0.9)"
              strokeWidth={4}
              isAnimationActive
            >
              {data.map((entry) => (
                <Cell key={entry.key} fill={entry.fill} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-3xl font-semibold text-white">{total}</div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">findings</div>
        </div>
      </div>

      <div className="grid content-center gap-2 sm:grid-cols-2">
        {data.map((item) => (
          <div key={item.key} className="rounded-md border border-white/10 bg-white/6 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full shadow-glow" style={{ backgroundColor: item.fill }} />
                <span className="truncate text-sm text-muted-foreground">{item.label}</span>
              </div>
              <span className="font-medium text-white">{item.value}</span>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function SeverityTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name?: string; value?: number; payload?: { fill?: string } }> }) {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0];
  if (!item) {
    return null;
  }

  return (
    <div className="rounded-md border border-white/10 bg-slate-950/95 px-3 py-2 text-xs shadow-glow backdrop-blur">
      <div className="font-medium text-white">{item.name}</div>
      <div className="mt-1 text-muted-foreground">{item.value ?? 0} findings</div>
    </div>
  );
}
