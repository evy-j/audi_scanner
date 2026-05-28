"use client";

import { motion } from "framer-motion";
import { toNumber } from "@/lib/utils";
import type { Scan } from "@/types/api";

export function RiskLineChart({ scans }: { scans: Scan[] }) {
  const ordered = [...scans].reverse().slice(-14);
  const points = ordered.map((scan, index) => ({
    x: ordered.length <= 1 ? 0 : (index / (ordered.length - 1)) * 100,
    y: 100 - toNumber(scan.riskScore)
  }));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  return (
    <div className="h-48 w-full">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id="risk-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="55%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#f87171" />
          </linearGradient>
        </defs>
        {Array.from({ length: 5 }).map((_, index) => (
          <line key={index} x1="0" x2="100" y1={index * 25} y2={index * 25} stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
        ))}
        {path ? (
          <motion.path
            d={path}
            fill="none"
            stroke="url(#risk-line)"
            strokeWidth="2.2"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9 }}
          />
        ) : null}
      </svg>
    </div>
  );
}
