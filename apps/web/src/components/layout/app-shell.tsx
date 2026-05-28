"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Building2,
  CreditCard,
  FileText,
  Github,
  Globe2,
  KeyRound,
  LockKeyhole,
  Radar,
  SearchCode,
  ShieldCheck
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { WorkspaceConfigPanel } from "@/components/layout/workspace-config-panel";
import { hasWorkspaceConfig } from "@/lib/api-client";
import { useWorkspaceConfig } from "@/hooks/use-workspace-config";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/scan", label: "Scan", icon: SearchCode },
  { href: "/reports/latest", label: "Reports", icon: FileText },
  { href: "/settings/organization", label: "Organization", icon: Building2 },
  { href: "/settings/security", label: "Security", icon: LockKeyhole },
  { href: "/settings/billing", label: "Billing", icon: CreditCard },
  { href: "/settings/integrations", label: "Integrations", icon: Github },
  { href: "/settings/chains", label: "Chains", icon: Globe2 },
  { href: "/settings/api-keys", label: "API Keys", icon: KeyRound }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { config, ready } = useWorkspaceConfig();
  const connected = ready && hasWorkspaceConfig(config);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-white/10 bg-slate-950/70 backdrop-blur-xl lg:block">
        <div className="flex h-full flex-col">
          <Link href="/" className="flex h-20 items-center gap-3 px-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary shadow-glow">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-wide text-white">Audit Scanner</div>
              <div className="text-xs text-muted-foreground">Security operations</div>
            </div>
          </Link>

          <nav className="space-y-1 px-4">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  href={item.href}
                  key={item.href}
                  className={cn(
                    "group relative flex h-11 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition hover:bg-white/8 hover:text-white",
                    active && "bg-white/10 text-white"
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="sidebar-active"
                      className="absolute inset-y-2 left-0 w-1 rounded-full bg-primary shadow-glow"
                    />
                  ) : null}
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto p-4">
            <div className="scanline rounded-lg border border-white/10 bg-white/6 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Radar className="h-4 w-4 text-primary" />
                Live mesh
              </div>
              <div className="grid grid-cols-5 gap-1">
                {Array.from({ length: 30 }).map((_, index) => (
                  <span
                    key={index}
                    className={cn(
                      "h-1.5 rounded-full bg-white/10",
                      index % 7 === 0 && "bg-primary/70",
                      index % 11 === 0 && "bg-sky-300/70",
                      index % 17 === 0 && "bg-red-300/70"
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/8 lg:hidden">
                <ShieldCheck className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Command center</div>
                <div className="hidden text-xs text-muted-foreground sm:block">Scans, findings, reports, and access controls</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-md border border-emerald-400/20 bg-emerald-400/8 px-3 py-2 text-xs text-emerald-100 md:flex">
                <Activity className="h-3.5 w-3.5" />
                {connected ? "API linked" : "API pending"}
              </div>
              <WorkspaceConfigPanel />
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
