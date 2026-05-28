"use client";

import { motion } from "framer-motion";
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip
} from "recharts";
import { severityWeights } from "@/components/visualizations/chart-theme";
import { ChartPlaceholder, useChartReady } from "@/components/visualizations/use-chart-ready";
import type { Vulnerability } from "@/types/api";

const domains = [
  { key: "access", label: "Access", pattern: /access|owner|role|auth|privilege|permission/i },
  { key: "calls", label: "Calls", pattern: /call|delegatecall|reentrancy|external/i },
  { key: "token", label: "Token", pattern: /mint|burn|blacklist|tax|whale|honeypot|liquid/i },
  { key: "oracle", label: "Oracle", pattern: /oracle|price|twap|manipulation|flash/i },
  { key: "upgrade", label: "Upgrade", pattern: /proxy|upgrade|initializer|storage/i },
  { key: "funds", label: "Funds", pattern: /withdraw|transfer|selfdestruct|balance|escrow/i }
] as const;

export function AttackSurfaceVisualization({ vulnerabilities }: { vulnerabilities: Vulnerability[] }) {
  const ready = useChartReady();
  const data = createAttackSurface(vulnerabilities);

  if (!ready) {
    return <ChartPlaceholder className="h-72 w-full" />;
  }

  return (
    <motion.div
      className="grid gap-4 lg:grid-cols-[1fr_260px]"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="h-72 min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <RadarChart data={data} outerRadius="74%">
            <PolarGrid stroke="rgba(255,255,255,0.12)" />
            <PolarAngleAxis dataKey="label" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
            <Tooltip content={<AttackSurfaceTooltip />} />
            <Radar
              dataKey="score"
              name="Exposure"
              stroke="#38bdf8"
              fill="#38bdf8"
              fillOpacity={0.28}
              strokeWidth={2}
              isAnimationActive
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid content-center gap-2">
        {data.map((item) => (
          <div key={item.key} className="rounded-md border border-white/10 bg-white/6 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{item.label}</span>
              <span className="font-medium text-white">{item.score}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-primary shadow-glow" style={{ width: `${item.score}%` }} />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function createAttackSurface(vulnerabilities: Vulnerability[]) {
  const raw = domains.map((domain) => {
    const score = vulnerabilities.reduce((sum, vulnerability) => {
      const searchable = `${vulnerability.category} ${vulnerability.title} ${vulnerability.description ?? ""}`;
      if (!domain.pattern.test(searchable)) {
        return sum;
      }
      return sum + severityWeights[vulnerability.severity];
    }, 0);
    return { key: domain.key, label: domain.label, rawScore: score };
  });
  const max = Math.max(10, ...raw.map((item) => item.rawScore));

  return raw.map((item) => ({
    ...item,
    score: Math.round((item.rawScore / max) * 100)
  }));
}

function AttackSurfaceTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: { rawScore?: number } }>;
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
      <div className="mt-1 text-muted-foreground">Exposure {item.value ?? 0}</div>
      <div className="text-muted-foreground">Weighted signals {item.payload?.rawScore ?? 0}</div>
    </div>
  );
}
