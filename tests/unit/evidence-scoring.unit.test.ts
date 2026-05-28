import { describe, expect, it } from "vitest";
import { FindingScoringService } from "../../packages/scanner-core/src/evidence/finding-scoring.service.js";

describe("FindingScoringService", () => {
  it("produces stable deterministic scores for source-backed findings", () => {
    const service = new FindingScoringService();

    const score = service.score({
      severity: "HIGH",
      confidence: "HIGH",
      analyzerCount: 1,
      evidenceItems: [
        {
          evidenceType: "ANALYZER",
          analyzer: "semgrep",
          toolName: "semgrep",
          filePath: "contracts/Vault.sol",
          startLine: 42,
          endLine: 42,
          ruleId: "reentrancy",
          detectorName: "reentrancy",
          message: "External call before state update",
          snippet: "function withdraw() external { msg.sender.call(\"\"); }",
          confidenceContribution: 0.78,
          rawArtifactPath: "scanner-runs/scan/semgrep/semgrep.json"
        }
      ]
    });

    expect(score).toMatchObject({
      state: "SUPPORTED",
      severityScore: 75,
      confidenceScore: 89,
      exploitabilityScore: 67,
      priorityScore: 77,
    });
  });

  it("marks missing assessed evidence as not assessed", () => {
    const service = new FindingScoringService();

    expect(
      service.score({
        severity: "MEDIUM",
        confidence: "LOW",
        analyzerCount: 0,
        evidenceItems: []
      }).state
    ).toBe("NOT_ASSESSED");
  });

  it("keeps weak tool output as a candidate when no source range exists", () => {
    const service = new FindingScoringService();

    const score = service.score({
      severity: "MEDIUM",
      confidence: "MEDIUM",
      analyzerCount: 1,
      evidenceItems: [
        {
          evidenceType: "ANALYZER",
          analyzer: "slither",
          toolName: "slither",
          ruleId: "unchecked-transfer",
          detectorName: "unchecked-transfer",
          message: "Transfer return value was not checked",
          confidenceContribution: 0.46,
          rawArtifactPath: "scanner-runs/scan/slither/slither.json"
        }
      ]
    });

    expect(score.state).toBe("CANDIDATE");
    expect(score.evidenceQuality).toBeLessThan(45);
  });
});
