import { describe, expect, it } from "vitest";
import { VulnerabilityNormalizationService } from "../../packages/scanner-core/src/normalization/vulnerability-normalization.service.js";

const scanId = "00000000-0000-4000-8000-000000000101";
const organizationId = "00000000-0000-4000-8000-000000000202";

describe("evidence-backed vulnerability normalization", () => {
  it("creates analyzer evidence with source range and snippet data", () => {
    const output = new VulnerabilityNormalizationService().normalize({
      scanId,
      organizationId,
      analyzers: [
        {
          analyzer: "semgrep",
          analyzerVersion: "1.2.3",
          artifactKey: "scanner-runs/scan-1/semgrep/run/semgrep.json",
          rawOutput: {
            results: [
              {
                check_id: "solidity.reentrancy.external-call",
                path: "contracts/Vault.sol",
                start: { line: 42, col: 9 },
                end: { line: 44, col: 10 },
                extra: {
                  message: "External call before state update",
                  lines: "msg.sender.call{value: amount}(\"\");",
                  metadata: {
                    severity: "HIGH",
                    confidence: "HIGH",
                    cwe: ["CWE-841"],
                    swc: ["SWC-107"]
                  }
                }
              }
            ]
          }
        }
      ]
    });

    expect(output.findings).toHaveLength(1);
    expect(output.vulnerabilities).toHaveLength(1);
    expect(output.findings[0]?.evidenceItems[0]).toMatchObject({
      evidenceType: "ANALYZER",
      analyzer: "semgrep",
      toolName: "semgrep",
      filePath: "contracts/Vault.sol",
      startLine: 42,
      endLine: 44,
      startColumn: 9,
      endColumn: 10,
      ruleId: "solidity.reentrancy.external-call",
      detectorName: "solidity.reentrancy.external-call",
      message: "External call before state update",
      rawArtifactPath: "scanner-runs/scan-1/semgrep/run/semgrep.json"
    });
    expect(output.findings[0]?.evidenceItems[0]?.snippet).toContain("msg.sender.call");
    expect(output.vulnerabilities[0]?.evidenceItems).toHaveLength(1);
  });

  it("suppresses exact duplicate analyzer messages before aggregation", () => {
    const duplicate = {
      check_id: "solidity.access-control.only-owner",
      path: "contracts/Admin.sol",
      start: { line: 17, col: 3 },
      end: { line: 17, col: 25 },
      extra: {
        message: "Missing access control",
        lines: "function setOwner(address next) external { owner = next; }",
        metadata: {
          severity: "HIGH",
          confidence: "HIGH"
        }
      }
    };

    const output = new VulnerabilityNormalizationService().normalize({
      scanId,
      organizationId,
      analyzers: [
        {
          analyzer: "semgrep",
          analyzerVersion: "1.2.3",
          artifactKey: "scanner-runs/scan-1/semgrep/run/semgrep.json",
          rawOutput: {
            results: [duplicate, { ...duplicate }]
          }
        }
      ]
    });

    expect(output.findings).toHaveLength(1);
    expect(output.vulnerabilities).toHaveLength(1);
    expect(output.vulnerabilities[0]?.evidenceItems).toHaveLength(1);
  });

  it("keeps findings with unavailable source ranges but lowers evidence quality inputs", () => {
    const output = new VulnerabilityNormalizationService().normalize({
      scanId,
      organizationId,
      analyzers: [
        {
          analyzer: "slither",
          analyzerVersion: "0.10.0",
          artifactKey: "scanner-runs/scan-1/slither/run/slither.json",
          rawOutput: {
            results: {
              detectors: [
                {
                  check: "unchecked-transfer",
                  impact: "Medium",
                  confidence: "Low",
                  description: "Transfer return value was not checked",
                  elements: []
                }
              ]
            }
          }
        }
      ]
    });

    expect(output.findings).toHaveLength(1);
    expect(output.findings[0]?.location.filePath).toBeUndefined();
    expect(output.findings[0]?.evidenceItems[0]?.confidenceContribution).toBeLessThan(0.5);
  });
});
