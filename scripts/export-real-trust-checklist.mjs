import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const checklist = {
  generatedAt: new Date().toISOString(),
  realityRule: "Do not claim auditors, customers, certifications, uptime, legal approval, or formal proof without real evidence.",
  workstreams: [
    { key: "formal-tool-adapters", evidence: ["tool version", "run artifact checksum", "reviewer approval"] },
    { key: "auditor-onboarding", evidence: ["NDA/contract", "portfolio", "conflict declaration"] },
    { key: "customer-pilots", evidence: ["scope", "consent", "feedback"] },
    { key: "public-track-record", evidence: ["published report", "customer consent", "disclaimer"] },
    { key: "legal-compliance", evidence: ["policy", "owner", "review date"] },
    { key: "operations-runbooks", evidence: ["owner", "escalation", "drill evidence"] }
  ]
};

const output = resolve(process.cwd(), "real-trust-checklist.json");
writeFileSync(output, JSON.stringify(checklist, null, 2));
console.log(`Wrote ${output}`);
