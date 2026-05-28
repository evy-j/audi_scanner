"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, FileText, LockKeyhole, Radar, ScanSearch, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThreatField } from "@/components/landing/threat-field";

const capabilities = [
  { icon: ScanSearch, label: "Static and symbolic analysis" },
  { icon: Radar, label: "Realtime worker telemetry" },
  { icon: Sparkles, label: "AI audit narratives" },
  { icon: LockKeyhole, label: "Enterprise RBAC controls" }
];

export function LandingPage() {
  return (
    <main className="min-h-screen">
      <section className="relative flex min-h-[92vh] items-center overflow-hidden">
        <ThreatField />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/30 via-slate-950/60 to-slate-950" />

        <div className="container relative z-10 py-24">
          <nav className="mb-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary shadow-glow">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <span className="text-sm font-semibold tracking-wide text-white">Audit Scanner</span>
            </Link>
            <Button asChild variant="secondary">
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
          </nav>

          <div className="grid items-end gap-12 lg:grid-cols-[1fr_420px]">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="max-w-4xl"
            >
              <Badge variant="blue" className="mb-5">Web3Guard AI public beta</Badge>
              <h1 className="max-w-4xl text-balance text-5xl font-semibold leading-tight text-white sm:text-7xl">
                Web3Guard AI
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
                Enterprise-grade smart contract scanning, vulnerability triage, live scan operations, and professional AI-assisted audit reports in one security command center.
              </p>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-amber-100">
                Web3Guard AI is a pre-audit readiness scanner. It is not a certified audit. Findings and remediation suggestions require human security review before production use.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/scan">
                    Launch scan
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link href="/reports/latest">
                    View reports
                    <FileText className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.12 }}
              className="glass-panel cyber-border rounded-lg p-5"
            >
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-white">Detection mesh</div>
                  <div className="text-xs text-muted-foreground">Slither, Mythril, Semgrep, Foundry</div>
                </div>
                <span className="h-2 w-2 rounded-full bg-primary shadow-glow" />
              </div>
              <div className="space-y-3">
                {capabilities.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.18 + index * 0.08 }}
                      className="flex items-center gap-3 rounded-md border border-white/10 bg-white/6 p-3"
                    >
                      <Icon className="h-4 w-4 text-primary" />
                      <span className="text-sm text-slate-200">{item.label}</span>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="container grid gap-4 pb-16 md:grid-cols-3">
        {["Queue-first scanning", "Normalized severity model", "Export-ready reports"].map((title) => (
          <div key={title} className="glass-panel rounded-lg p-5">
            <div className="text-sm font-semibold text-white">{title}</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Built for distributed workers, secure artifact handling, and executive audit workflows.
            </p>
          </div>
        ))}
      </section>
    </main>
  );
}
