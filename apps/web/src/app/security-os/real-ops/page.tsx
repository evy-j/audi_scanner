import { REAL_TRUST_OPERATION_TEMPLATES } from "@audit-scanner/shared";

export default function RealTrustOperationsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <section className="mx-auto max-w-7xl space-y-8">
        <div className="rounded-3xl border border-emerald-400/20 bg-slate-900/80 p-8 shadow-2xl shadow-emerald-950/20">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-300">P25+ Real Trust Operations</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight">Auditors, customers, legal, formal adapters, and operating trust</h1>
          <p className="mt-4 max-w-4xl text-sm leading-6 text-slate-300">
            This page tracks the real-world layer that code cannot fake: real auditor onboarding, real customer pilots, formal tool adapter activation,
            public track record evidence, legal/compliance operations, and production runbooks. Every card below requires real evidence before any public claim.
          </p>
          <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-950/30 p-4 text-sm text-amber-100">
            Reality rule: this system can organize trust work, but it cannot fabricate auditors, customers, certifications, uptime, legal approval, or audit history.
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {REAL_TRUST_OPERATION_TEMPLATES.map((template) => (
            <article key={template.key} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">{template.title}</h2>
                <span className="rounded-full border border-cyan-400/30 px-3 py-1 text-xs font-semibold text-cyan-200">
                  {template.artifactType}
                </span>
              </div>
              <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-500">Owner</p>
              <p className="mt-1 text-sm text-slate-200">{template.recommendedOwner}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.2em] text-slate-500">Required real evidence</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                {template.requiredEvidence.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <p className="mt-4 text-xs uppercase tracking-[0.2em] text-slate-500">Blocked claims until proven</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {template.blockedClaims.map((claim) => (
                  <span key={claim} className="rounded-full bg-rose-950/50 px-3 py-1 text-xs text-rose-100">{claim}</span>
                ))}
              </div>
              <p className="mt-4 text-xs text-amber-200">Safe default: {template.safeDefaultStatus} · Claim policy: {template.claimPolicy}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
