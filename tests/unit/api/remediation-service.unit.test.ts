import { beforeEach, describe, expect, it, vi } from "vitest";
import { RemediationService } from "../../../apps/api/src/modules/remediation/remediation.service.js";
import { sanitizeRemediationOutput } from "../../../apps/api/src/modules/remediation/remediation-prompt.js";
import type { RemediationOutput } from "../../../apps/api/src/modules/remediation/remediation-prompt.js";

describe("RemediationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks a suppressed finding not eligible without calling the provider", async () => {
    const harness = createHarness({
      pack: remediationPack({ eligible: false, reason: "Suppressed findings are not eligible for remediation" })
    });

    const result = await harness.service.remediateFinding("finding-1", actor());

    expect(result.status).toBe("NOT_ELIGIBLE");
    expect(harness.repository.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "NOT_ELIGIBLE",
        errorCategory: "NOT_ELIGIBLE"
      })
    );
    expect(harness.provider.generateJson).not.toHaveBeenCalled();
  });

  it("stores guidance only when no exact source range is available", async () => {
    const harness = createHarness({
      pack: remediationPack({ diffSuggestionsAllowed: false, guidanceOnly: true }),
      output: validOutputWithDiff()
    });

    const result = await harness.service.remediateFinding("finding-1", actor());

    expect(result.status).toBe("SUCCEEDED");
    expect(harness.repository.persistOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        allowDiffs: false
      })
    );
    expect(result.run.diffs).toEqual([]);
  });

  it("persists provider-not-configured when AI remediation is disabled", async () => {
    const harness = createHarness({ providerConfigured: false });

    const result = await harness.service.remediateFinding("finding-1", actor());

    expect(result.status).toBe("PROVIDER_NOT_CONFIGURED");
    expect(harness.repository.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "PROVIDER_NOT_CONFIGURED",
        errorCategory: "PROVIDER_NOT_CONFIGURED"
      })
    );
    expect(harness.provider.generateJson).not.toHaveBeenCalled();
  });

  it("rejects malformed remediation output without persisting trusted suggestions", async () => {
    const harness = createHarness({
      output: { guidance: { title: "Incomplete" } }
    });

    const result = await harness.service.remediateFinding("finding-1", actor());

    expect(result.status).toBe("FAILED");
    expect(harness.repository.failRun).toHaveBeenCalledWith(
      "remediation-run-1",
      expect.any(Date),
      expect.objectContaining({ errorCategory: "SCHEMA_VALIDATION" })
    );
    expect(harness.repository.persistOutput).not.toHaveBeenCalled();
  });

  it("persists diff suggestions separately from the original finding", async () => {
    const harness = createHarness({ output: validOutputWithDiff() });

    await harness.service.remediateFinding("finding-1", actor());

    expect(harness.repository.persistOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({
          diffs: [expect.objectContaining({ filePath: "contracts/Vault.sol" })]
        })
      })
    );
    expect(harness.repository).not.toHaveProperty("updateFinding");
  });

  it("redacts generated secrets before persistence", () => {
    const sanitized = sanitizeRemediationOutput({
      ...validOutputWithDiff(),
      guidance: {
        title: "Rotate key",
        summary: "apiKey = \"sk-123456789012345678901234\" requires human review",
        steps: ["Replace 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa requires human review."],
        limitations: ["requires human review"]
      }
    });

    expect(JSON.stringify(sanitized)).toContain("[REDACTED_SECRET]");
    expect(JSON.stringify(sanitized)).toContain("[REDACTED_HEX_SECRET]");
    expect(JSON.stringify(sanitized)).not.toContain("sk-123456789012345678901234");
  });
});

function createHarness(input: {
  pack?: ReturnType<typeof remediationPack> | undefined;
  output?: unknown;
  providerConfigured?: boolean | undefined;
} = {}) {
  const providerConfigured = input.providerConfigured ?? true;
  const provider = {
    providerName: "LOCAL",
    model: "deterministic",
    isConfigured: vi.fn(() => providerConfigured),
    generateJson: vi.fn(async () => ({
      rawText: "{}",
      json: input.output ?? validOutputWithDiff(),
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
    }))
  };
  const repository = {
    createRun: vi.fn(async (data: any) => ({
      id: "remediation-run-1",
      ...data
    })),
    persistOutput: vi.fn(async (data: any) => ({
      id: "remediation-run-1",
      status: "SUCCEEDED",
      diffs: data.allowDiffs ? data.output.diffs : [],
      suggestions: [{ id: "suggestion-1", kind: "GUIDANCE" }]
    })),
    failRun: vi.fn(async (_runId: string, _startedAt: Date, data: any) => ({
      id: "remediation-run-1",
      ...data
    }))
  };
  const packBuilder = {
    buildFindingPack: vi.fn(async () => ({
      pack: input.pack ?? remediationPack(),
      checksum: "input-checksum"
    }))
  };
  const artifactStore = {
    writeJsonArtifact: vi.fn(async (_prefix: string, relativePath: string) => ({
      artifactKey: `remediations/${relativePath}`,
      checksum: "artifact-checksum"
    }))
  };
  const usageLimits = {
    assertAndConsume: vi.fn(async () => undefined)
  };

  return {
    service: new RemediationService(repository as never, packBuilder as never, provider as never, artifactStore, usageLimits as never),
    repository,
    packBuilder,
    provider,
    artifactStore,
    usageLimits
  };
}

function actor() {
  return {
    organizationId: "org-1",
    actorUserId: "user-1"
  };
}

function remediationPack(input: {
  eligible?: boolean | undefined;
  reason?: string | null | undefined;
  diffSuggestionsAllowed?: boolean | undefined;
  guidanceOnly?: boolean | undefined;
} = {}) {
  const eligible = input.eligible ?? true;
  const diffSuggestionsAllowed = input.diffSuggestionsAllowed ?? true;
  return {
    version: "p5-remediation-pack/v1",
    scope: "FINDING_REMEDIATION",
    eligibility: {
      eligible,
      status: eligible ? "ELIGIBLE" : "NOT_ELIGIBLE",
      reason: input.reason ?? null,
      guidanceOnly: input.guidanceOnly ?? !diffSuggestionsAllowed
    },
    diffSuggestionsAllowed,
    limitations: ["requires human review"],
    scan: {
      id: "scan-1",
      organizationId: "org-1",
      projectId: "project-1",
      status: "COMPLETED",
      title: "Scan",
      riskScore: 10
    },
    finding: {
      id: "finding-1",
      title: "External call before state update",
      description: "Analyzer evidence",
      severity: "HIGH",
      confidence: "HIGH",
      confidenceState: "SUPPORTED",
      status: "OPEN",
      analyzer: "SEMGREP",
      detectorRuleId: "reentrancy",
      category: "REENTRANCY",
      location: { filePath: "contracts/Vault.sol", startLine: 10, endLine: 12, startColumn: null, endColumn: null },
      remediationText: null
    },
    p1Evidence: [
      {
        id: "evidence-1",
        evidenceType: "ANALYZER",
        ruleId: "reentrancy",
        detectorName: "Semgrep",
        message: "External call before state update",
        location: { filePath: "contracts/Vault.sol", startLine: 10, endLine: 12, startColumn: null, endColumn: null },
        snippet: "msg.sender.call(\"\");",
        rawArtifactPath: "semgrep.json",
        rawArtifactChecksum: "sha"
      }
    ],
    eligibleSourceLocations: diffSuggestionsAllowed
      ? [
          {
            filePath: "contracts/Vault.sol",
            startLine: 10,
            endLine: 12,
            startColumn: null,
            endColumn: null,
            snippet: "msg.sender.call(\"\");",
            source: "p1_evidence"
          }
        ]
      : [],
    p2aReview: { status: "UNREVIEWED", comments: [], events: [] },
    p2bCodeLinks: [],
    p3Context: { buildProfiles: [], buildRuns: [], compilerArtifacts: [], testRuns: [] },
    p4AiValidation: {
      latestDecision: "EVIDENCE_MEDIUM",
      status: "SUCCEEDED",
      reasoningSummary: "Evidence is relevant.",
      contradictionNotes: null,
      humanReviewerChecklist: ["Review requires human review"]
    }
  } as const;
}

function validOutputWithDiff(): RemediationOutput {
  return {
    guidance: {
      title: "Move state update before external call",
      summary: "Update state before the external interaction; this requires human review.",
      steps: ["Move the balance decrement before the external call; requires human review."],
      limitations: ["This suggestion was not compiled or tested and requires human review."]
    },
    safetyStatus: "NEEDS_HUMAN_REVIEW",
    behaviorChangeNotes: ["Withdrawal ordering changes require human review."],
    diffs: [
      {
        filePath: "contracts/Vault.sol",
        originalRange: { startLine: 10, endLine: 12 },
        proposedPatch: "@@\n- call();\n+ balance = 0;\n+ call();",
        explanation: "Minimal ordering change; requires human review.",
        risk: "May change observable ordering; requires human review.",
        behaviorChangeNotes: ["Ordering changes require human review."],
        requiresHumanReview: true
      }
    ],
    tests: [
      {
        title: "Regression withdrawal ordering",
        testFramework: "FOUNDRY",
        description: "Add a regression test around withdrawal ordering; requires human review.",
        skeleton: "function testWithdrawalOrdering() public { /* requires human review */ }",
        expectedFailingBefore: "Before the fix the regression should expose stale accounting; requires human review.",
        expectedFixedAfter: "After the fix the balance update should be observed first; requires human review.",
        requiresHumanReview: true
      }
    ],
    checklist: ["Confirm the patch is minimal and requires human review."]
  };
}
