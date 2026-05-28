"use client";

import { motion } from "framer-motion";

const colors = {
  critical: "#f87171",
  high: "#fb923c",
  medium: "#facc15",
  low: "#38bdf8",
  informational: "#34d399"
};

export function SeverityDonut({
  counts
}: {
  counts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    informational: number;
  };
}) {
  const segments = [
    { key: "critical", value: counts.critical, color: colors.critical },
    { key: "high", value: counts.high, color: colors.high },
    { key: "medium", value: counts.medium, color: colors.medium },
    { key: "low", value: counts.low, color: colors.low },
    { key: "informational", value: counts.informational, color: colors.informational }
  ];
  const total = Math.max(1, segments.reduce((sum, segment) => sum + segment.value, 0));
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 120 120" className="h-32 w-32 shrink-0 -rotate-90">
        <circle cx="60" cy="60" r="44" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" />
        {segments.map((segment, index) => {
          const length = (segment.value / total) * 276.46;
          const dash = `${length} ${276.46 - length}`;
          const circle = (
            <motion.circle
              key={segment.key}
              cx="60"
              cy="60"
              r="44"
              fill="none"
              stroke={segment.color}
              strokeWidth="14"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.8, delay: index * 0.08 }}
            />
          );
          offset += length;
          return circle;
        })}
      </svg>
      <div className="min-w-0 flex-1 space-y-2">
        {segments.map((segment) => (
          <div key={segment.key} className="flex items-center justify-between gap-3 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: segment.color }} />
              <span className="truncate capitalize text-muted-foreground">{segment.key}</span>
            </div>
            <span className="font-medium text-white">{segment.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
