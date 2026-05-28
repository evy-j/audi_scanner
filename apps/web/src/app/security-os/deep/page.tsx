
import { SECURITY_OS_DEEP_PHASES } from "@audit-scanner/shared";

export default function SecurityOsDeepPage() {
  const totalCapabilities = SECURITY_OS_DEEP_PHASES.reduce((sum, phase) => sum + phase.capabilities.length, 0);
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <section className="mx-auto max-w-7xl space-y-8">
        <div className="rounded-3xl border border-cyan-400/20 bg-slate-900/80 p-8 shadow-2xl shadow-cyan-950/20">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">Web3Guard Security OS</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight">P15–P25+ deep implementation foundation</h1>
          <p className="mt-4 max-w-4xl text-sm leading-6 text-slate-300">
            This surface tracks the actual P15–P25+ persistence/API/UI foundation: formal verification records, human audit sign-off,
            public trust registry, advanced threat intelligence, operations, marketplace rooms, bounty workflow, detector evals,
            incident response, compliance evidence packs, self-hosted appliance readiness, and real operations milestones.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-xs text-slate-400">Phases</p>
              <p className="mt-1 text-2xl font-semibold">{SECURITY_OS_DEEP_PHASES.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-xs text-slate-400">Capability records</p>
              <p className="mt-1 text-2xl font-semibold">{totalCapabilities}</p>
            </div>
            <div className="rounded-2xl border border-amber-400/30 bg-amber-950/30 p-4">
              <p className="text-xs text-amber-200">Reality rule</p>
              <p className="mt-1 text-sm font-semibold">No fake proofs, audits, customers, certifications, or incidents</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {SECURITY_OS_DEEP_PHASES.map((phase) => (
            <article key={phase.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">{phase.id} · {phase.title}</h2>
                <span className="rounded-full border border-emerald-400/30 px-3 py-1 text-xs font-semibold text-emerald-200">
                  {phase.implementationStatus.replaceAll("_", " ")}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">{phase.objective}</p>
              <div className="mt-4 space-y-3">
                {phase.capabilities.map((capability) => (
                  <div key={capability.key} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-cyan-100">{capability.label}</p>
                      <span className="rounded-full bg-slate-800 px-2 py-1 text-[11px] text-slate-300">{capability.artifactType}</span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-400">Needs: {capability.realInputs.join(" · ")}</p>
                    <p className="mt-2 text-xs text-amber-200">Safe default: {capability.safeDefaultStatus}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="rounded-2xl border border-rose-400/20 bg-rose-950/20 p-5 text-sm leading-6 text-rose-100">
          CertiK-level reality: this implements deep platform foundations. It still does not replace real human auditors, real customer audits,
          legal/compliance operations, third-party certifications, or a public trust track record.
        </div>
      </section>
    </main>
  );
}
