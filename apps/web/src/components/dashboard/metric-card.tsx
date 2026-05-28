"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "primary"
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: "primary" | "red" | "amber" | "blue";
}) {
  const toneClass = {
    primary: "text-primary bg-primary/10 border-primary/20",
    red: "text-red-200 bg-red-500/10 border-red-400/20",
    amber: "text-amber-200 bg-amber-500/10 border-amber-400/20",
    blue: "text-sky-200 bg-sky-500/10 border-sky-400/20"
  }[tone];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <Card className="overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm text-muted-foreground">{label}</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-white">{value}</div>
            </div>
            <div className={`rounded-md border p-2 ${toneClass}`}>
              <Icon className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4 text-xs text-muted-foreground">{detail}</div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
