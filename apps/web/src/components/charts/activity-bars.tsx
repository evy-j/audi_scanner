"use client";

import { motion } from "framer-motion";
import type { Scan } from "@/types/api";

export function ActivityBars({ scans }: { scans: Scan[] }) {
  const buckets = Array.from({ length: 12 }, (_, index) => {
    const scan = scans[index];
    return scan ? Math.max(8, Math.min(100, Number(scan.progress) || 0)) : 8;
  }).reverse();

  return (
    <div className="flex h-28 items-end gap-2">
      {buckets.map((height, index) => (
        <motion.div
          key={index}
          className="flex-1 rounded-t-md bg-primary/70 shadow-glow"
          initial={{ height: 6, opacity: 0.4 }}
          animate={{ height: `${height}%`, opacity: 0.95 }}
          transition={{ duration: 0.45, delay: index * 0.04 }}
        />
      ))}
    </div>
  );
}
