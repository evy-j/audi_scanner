const phases = [
  {
    "id": "P14",
    "title": "Multi-chain expansion and chain registry",
    "objective": "Add chain registry, explorer metadata, RPC safety, analyzer chain context, multi-chain report sections, and chain-specific monitoring constraints."
  },
  {
    "id": "P15",
    "title": "Formal verification and specification layer",
    "objective": "Add formal/spec readiness for SMTChecker/Scribble/Certora-style adapters with real-only proof status and no fake verification claims."
  },
  {
    "id": "P16",
    "title": "Manual auditor workflow and report sign-off",
    "objective": "Add human audit rooms, reviewer assignment, severity override governance, dual-review sign-off, locked final reports, and audit delivery workflow."
  },
  {
    "id": "P17",
    "title": "Public trust registry and project scorecards",
    "objective": "Add public verified report registry, risk trend scorecards, monitoring status pages, redaction rules, and no-certified-audit disclaimers."
  },
  {
    "id": "P18",
    "title": "Advanced threat intelligence and incident correlation",
    "objective": "Extend threat knowledge into incident timelines, campaign correlation, wallet/contract labels with provenance, and confidence-scored indicators."
  },
  {
    "id": "P19",
    "title": "Production scale, observability, and cost controls",
    "objective": "Add platform observability, job queue scaling policy, worker isolation, cost budgets, artifact retention, and operational SLO runbooks."
  },
  {
    "id": "P20",
    "title": "Auditor marketplace and private audit rooms",
    "objective": "Add private engagement workflow, auditor profiles, client/auditor comment threads, report approval packages, and marketplace-safe non-fake availability."
  },
  {
    "id": "P21",
    "title": "Researcher bounty and competitive review workflow",
    "objective": "Add bounty/contest lifecycle, submission triage, duplicate handling, reward accounting placeholders, and disclosure policy governance."
  },
  {
    "id": "P22",
    "title": "Detector benchmark and model evaluation harness",
    "objective": "Add benchmark corpus metadata, detector precision regression tests, AI validation evals, false-positive tracking, and release gates."
  },
  {
    "id": "P23",
    "title": "Incident response and SOC workflows",
    "objective": "Add alert escalation, incident rooms, timeline/evidence packs, post-mortems, on-call handoff, and read-only response playbooks."
  },
  {
    "id": "P24",
    "title": "Compliance and enterprise evidence packs",
    "objective": "Add SOC2/ISO-readiness evidence collection, controls mapping, retention proofs, audit exports, without claiming certification."
  },
  {
    "id": "P25",
    "title": "Self-hosted enterprise appliance and deployment hardening",
    "objective": "Add self-hosted deployment blueprint, KMS/secrets policy, backup/restore, private networking, and tenant isolation verification."
  },
  {
    "id": "P25_PLUS",
    "title": "Real operations, auditors, customers, and trust moat",
    "objective": "Non-code milestone for real auditors, public track record, client audits, legal/compliance, support, incident response, and brand trust."
  }
] as const;

export default function SecurityOsRoadmapPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <section className="mx-auto max-w-6xl space-y-8">
        <div className="rounded-3xl border border-cyan-400/20 bg-slate-900/70 p-8 shadow-2xl shadow-cyan-950/20">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">Web3Guard Security OS</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight">P14–P25+ expansion roadmap</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
            This page tracks real-only Security OS expansion foundations. It documents implemented contracts without pretending that
            multi-chain providers, formal verification, public trust registry, auditor marketplace, compliance certification,
            or human audit operations are already completed.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {phases.map((phase) => (
            <article key={phase.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-white">{phase.id} · {phase.title}</h2>
                <span className="rounded-full border border-amber-400/30 px-3 py-1 text-xs font-semibold text-amber-200">Deep foundation</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">{phase.objective}</p>
            </article>
          ))}
        </div>

        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-950/20 p-5 text-sm leading-6 text-emerald-100">
          Safe claim: P14–P25+ include implementation contracts and deep foundations. They do not claim certified audits,
          fake provider status, fake formal proofs, fake incident intelligence, fake marketplace availability, or fake compliance.
        </div>
      </section>
    </main>
  );
}
