import { describe, expect, it } from "vitest";
import { redactSecrets } from "../../../apps/worker/src/services/ai-validation/redaction.js";
import {
  buildFindingValidationPrompt,
  parseAiFindingValidationOutput
} from "../../../apps/worker/src/services/ai-validation/prompt-builder.js";
import { resolveAiValidationConfig, isProviderConfigured } from "../../../apps/worker/src/services/ai-validation/provider.js";
import type { FindingEvidencePack } from "../../../apps/worker/src/services/ai-validation/evidence-pack-builder.js";

describe("AI validation prompt safety", () => {
  it("treats disabled AI as provider not configured", () => {
    const config = resolveAiValidationConfig({
      AI_ENABLED: "false",
      AI_PROVIDER: "OPENAI",
      AI_MODEL: "gpt-test",
      AI_API_KEY: "sk-test"
    });

    expect(isProviderConfigured(config)).toBe(false);
  });

  it("redacts secrets before snippets are sent to AI", () => {
    const redacted = redactSecrets('const apiKey = "sk-123456789012345678901234"; const pk = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";');

    expect(redacted).toContain("[REDACTED_SECRET]");
    expect(redacted).toContain("[REDACTED_HEX_SECRET]");
    expect(redacted).not.toContain("sk-123456789012345678901234");
  });

  it("includes persisted evidence IDs and source ranges in the finding prompt", () => {
    const prompt = buildFindingValidationPrompt(findingPack()).userPrompt;

    expect(prompt).toContain("evidence-1");
    expect(prompt).toContain('"startLine": 10');
    expect(prompt).toContain("Do not create a new vulnerability");
    expect(prompt).toContain("NOT_ENOUGH_EVIDENCE");
  });

  it("rejects malformed AI output", () => {
    expect(() =>
      parseAiFindingValidationOutput({
        decision: "EVIDENCE_STRONG",
        reasoningSummary: "missing scores and checklist"
      })
    ).toThrow();
  });
});

function findingPack(): FindingEvidencePack {
  return {
    version: "p4-ai-evidence-pack/v1",
    scope: "FINDING",
    scan: {
      id: "scan-1",
      organizationId: "org-1",
      projectId: "project-1",
      status: "COMPLETED",
      title: "Scan",
      riskScore: 42,
      analyzerRuns: [],
      analysisIrRuns: []
    },
    finding: {
      id: "finding-1",
      title: "External call",
      description: "Analyzer reported an external call",
      severity: "HIGH",
      confidence: "MEDIUM",
      confidenceState: "SUPPORTED",
      status: "OPEN",
      analyzer: "SLITHER",
      detectorRuleId: "reentrancy",
      category: "REENTRANCY",
      location: {
        filePath: "contracts/Vault.sol",
        startLine: 10,
        endLine: 12,
        startColumn: 1,
        endColumn: 4
      },
      scores: {
        severity: 80,
        confidence: 70,
        exploitability: 60,
        priority: 75,
        evidenceQuality: 90
      }
    },
    p1Evidence: [
      {
        id: "evidence-1",
        evidenceType: "ANALYZER",
        ruleId: "reentrancy",
        detectorName: "Slither",
        message: "External call before state update",
        location: {
          filePath: "contracts/Vault.sol",
          startLine: 10,
          endLine: 12,
          startColumn: 1,
          endColumn: 4
        },
        snippet: "target.call(\"\");",
        analyzerRunId: "run-1",
        analyzerEvidenceId: "analyzer-evidence-1",
        rawArtifactPath: "slither.json",
        rawArtifactChecksum: "sha"
      }
    ],
    sourceRanges: [],
    detectorMetadata: [],
    p2aReview: {
      status: "UNREVIEWED",
      suppressionRuleId: null,
      comments: [],
      events: []
    },
    p2bCodeLinks: [],
    p3Context: {
      buildProfiles: [],
      buildRuns: [{ id: "build-1", toolKind: "UNKNOWN", command: "", status: "NOT_ASSESSED", exitCode: null, artifactPath: null, artifactChecksumSha256: null, errorCategory: null, error: null }],
      compilerArtifacts: [],
      testRuns: [],
      toolAvailability: []
    }
  };
}
