import type {
  AggregatedVulnerability,
  NormalizedSeverity,
  SourceLocation,
  VulnerabilityCategory
} from "@audit-scanner/scanner-core";
import type {
  AuditReportDocument,
  AuditReportFinding,
  ReportGenerationInput,
  ReportRiskRating,
  SecureCodeExample
} from "./report-types.js";

const severityOrder: NormalizedSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"];

export class AuditReportBuilder {
  build(input: ReportGenerationInput): AuditReportDocument {
    const vulnerabilities = rankVulnerabilities(input.normalization.vulnerabilities);
    const severityCounts = input.normalization.summary.severityCounts;
    const riskRating = getRiskRating(input.riskScore);

    return {
      schemaVersion: "audit-report/v1",
      reportNumber: input.reportNumber,
      scanId: input.normalization.scanId,
      organizationId: input.normalization.organizationId,
      generatedAt: input.generatedAt,
      title: `Smart Contract Security Audit - ${input.normalization.scanId}`,
      riskScore: input.riskScore,
      riskRating,
      executiveSummary: buildExecutiveSummary(input.riskScore, riskRating, severityCounts),
      scope: {
        analyzerCoverage: input.normalization.summary.analyzerCoverage,
        totalAnalyzerFindings: input.normalization.summary.totalAnalyzerFindings,
        uniqueVulnerabilities: input.normalization.summary.uniqueVulnerabilities
      },
      severityAnalysis: {
        counts: severityCounts,
        highestSeverity: getHighestSeverity(severityCounts),
        narrative: buildSeverityNarrative(severityCounts)
      },
      findings: vulnerabilities.map((vulnerability) => buildFinding(vulnerability)),
      recommendations: buildGlobalRecommendations(vulnerabilities),
      methodology: [
        "Static analysis was performed across normalized analyzer outputs.",
        "Findings were deduplicated by fingerprint and source location.",
        "Severity and confidence were normalized into a unified risk model.",
        "Report content was generated from normalized evidence and audited remediation patterns."
      ],
      ai: {
        provider: "deterministic",
        used: false,
        promptVersion: "audit-report-v1",
        generatedAt: input.generatedAt
      },
      sourceArtifacts: {
        normalizedArtifactKey: input.normalizedArtifactKey
      }
    };
  }
}

function buildFinding(vulnerability: AggregatedVulnerability): AuditReportFinding {
  const guidance = categoryGuidance[vulnerability.category] ?? categoryGuidance.OTHER;

  return {
    id: vulnerability.id,
    fingerprint: vulnerability.fingerprint,
    title: vulnerability.title,
    category: vulnerability.category,
    severity: vulnerability.severity,
    confidence: vulnerability.confidence,
    riskScore: vulnerability.riskScore,
    affectedLocations: vulnerability.locations.map(formatLocation).filter(Boolean),
    cweIds: vulnerability.cweIds,
    swcIds: vulnerability.swcIds,
    owaspSmartContractTop10: vulnerability.owaspSmartContractTop10,
    attackExplanation: buildAttackExplanation(vulnerability, guidance.attack),
    evidenceSummary: buildEvidenceSummary(vulnerability),
    remediation: vulnerability.remediation ?? guidance.remediation,
    secureCodeExample: guidance.secureCodeExample,
    references: vulnerability.references,
    analyzers: vulnerability.analyzers
  };
}

function buildExecutiveSummary(
  riskScore: number,
  riskRating: ReportRiskRating,
  counts: { critical: number; high: number; medium: number; low: number; informational: number }
): string {
  const severe = counts.critical + counts.high;
  const total = severe + counts.medium + counts.low + counts.informational;

  if (total === 0) {
    return "The automated audit did not identify exploitable vulnerabilities in the normalized analyzer output. Manual review is still recommended before production deployment.";
  }

  return [
    `The audit produced an overall ${riskRating.toLowerCase()} risk rating with a score of ${riskScore.toFixed(2)}/100.`,
    `The scanner identified ${total} unique issue${total === 1 ? "" : "s"}, including ${counts.critical} critical and ${counts.high} high severity finding${severe === 1 ? "" : "s"}.`,
    severe > 0
      ? "High-impact issues should be remediated and retested before deployment or protocol upgrades."
      : "No critical or high severity issue was identified, but medium and low severity items should still be triaged before release."
  ].join(" ");
}

function buildSeverityNarrative(counts: {
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
}): string {
  if (counts.critical > 0) {
    return "Critical findings indicate conditions that may allow direct loss of funds, unauthorized control, or severe protocol failure.";
  }
  if (counts.high > 0) {
    return "High severity findings indicate practical exploit paths that should be fixed before production use.";
  }
  if (counts.medium > 0) {
    return "Medium severity findings require engineering review because they can become exploitable under specific protocol or market conditions.";
  }
  if (counts.low > 0 || counts.informational > 0) {
    return "The identified issues are primarily hardening, maintainability, or defense-in-depth improvements.";
  }
  return "No vulnerabilities were present in the normalized analyzer output.";
}

function buildAttackExplanation(
  vulnerability: AggregatedVulnerability,
  categoryAttackNarrative: string
): string {
  const location = formatLocation(vulnerability.primaryLocation);
  const locationText = location ? ` The primary affected location is ${location}.` : "";
  return `${categoryAttackNarrative} ${vulnerability.description}${locationText}`.trim();
}

function buildEvidenceSummary(vulnerability: AggregatedVulnerability): string {
  const evidence = vulnerability.evidence
    .map((item) => item.summary)
    .filter(Boolean)
    .slice(0, 3);

  if (evidence.length === 0) {
    return "The finding was produced by analyzer consensus without additional structured evidence.";
  }

  return evidence.join(" ");
}

function buildGlobalRecommendations(vulnerabilities: AggregatedVulnerability[]): string[] {
  const categories = new Set(vulnerabilities.map((vulnerability) => vulnerability.category));
  const recommendations = [
    "Remediate critical and high severity findings before deployment.",
    "Run the full scanner suite after every remediation commit.",
    "Add regression tests that reproduce each confirmed issue."
  ];

  if (categories.has("ACCESS_CONTROL") || categories.has("SUSPICIOUS_OWNERSHIP")) {
    recommendations.push("Review all privileged roles, ownership transfer flows, and emergency controls.");
  }
  if (categories.has("REENTRANCY") || categories.has("UNSAFE_EXTERNAL_CALL")) {
    recommendations.push("Apply checks-effects-interactions and add reentrancy tests around all value-transfer paths.");
  }
  if (categories.has("ORACLE_MANIPULATION") || categories.has("FLASH_LOAN")) {
    recommendations.push("Harden oracle assumptions using TWAPs, liquidity checks, and adversarial market simulations.");
  }

  return Array.from(new Set(recommendations));
}

function rankVulnerabilities(vulnerabilities: AggregatedVulnerability[]): AggregatedVulnerability[] {
  return [...vulnerabilities].sort((left, right) => {
    const severityDelta = severityOrder.indexOf(left.severity) - severityOrder.indexOf(right.severity);
    if (severityDelta !== 0) {
      return severityDelta;
    }
    return right.riskScore - left.riskScore;
  });
}

function getHighestSeverity(counts: {
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
}): NormalizedSeverity | "NONE" {
  if (counts.critical > 0) return "CRITICAL";
  if (counts.high > 0) return "HIGH";
  if (counts.medium > 0) return "MEDIUM";
  if (counts.low > 0) return "LOW";
  if (counts.informational > 0) return "INFORMATIONAL";
  return "NONE";
}

function getRiskRating(score: number): ReportRiskRating {
  if (score >= 90) return "CRITICAL";
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  if (score > 0) return "LOW";
  return "INFORMATIONAL";
}

function formatLocation(location: SourceLocation): string {
  const path = location.filePath ?? "unknown file";
  const line =
    typeof location.lineStart === "number"
      ? `:${location.lineStart}${typeof location.lineEnd === "number" && location.lineEnd !== location.lineStart ? `-${location.lineEnd}` : ""}`
      : "";
  const symbol = [location.contractName, location.functionName].filter(Boolean).join(".");
  return `${path}${line}${symbol ? ` (${symbol})` : ""}`;
}

const categoryGuidance: Record<
  VulnerabilityCategory,
  {
    attack: string;
    remediation: string;
    secureCodeExample: SecureCodeExample;
  }
> = {
  REENTRANCY: {
    attack:
      "An attacker may re-enter the contract before state transitions are finalized, repeatedly executing sensitive logic.",
    remediation:
      "Update state before external calls, use ReentrancyGuard on value-transfer entry points, and isolate untrusted external interactions.",
    secureCodeExample: {
      language: "solidity",
      code: "function withdraw(uint256 amount) external nonReentrant {\n    balances[msg.sender] -= amount;\n    (bool ok, ) = msg.sender.call{value: amount}(\"\");\n    require(ok, \"TRANSFER_FAILED\");\n}",
      notes: "State is updated before the external call and the function is protected by a reentrancy guard."
    }
  },
  INTEGER_OVERFLOW: {
    attack:
      "Arithmetic edge cases may allow values to wrap or bypass intended accounting assumptions.",
    remediation:
      "Use Solidity 0.8+ checked arithmetic, validate bounds explicitly, and avoid unchecked blocks unless formally justified.",
    secureCodeExample: {
      language: "solidity",
      code: "function deposit(uint256 amount) external {\n    require(amount > 0, \"ZERO_AMOUNT\");\n    balances[msg.sender] += amount;\n}",
      notes: "Solidity 0.8+ reverts on overflow by default."
    }
  },
  TX_ORIGIN: {
    attack:
      "A phishing contract can invoke the target contract and preserve tx.origin as the victim address.",
    remediation: "Use msg.sender for authorization and remove tx.origin from permission checks.",
    secureCodeExample: {
      language: "solidity",
      code: "modifier onlyOwner() {\n    require(msg.sender == owner, \"NOT_OWNER\");\n    _;\n}",
      notes: "Authorization is based on the immediate caller."
    }
  },
  ACCESS_CONTROL: {
    attack:
      "Missing or incomplete authorization may let an attacker call privileged functions or alter protocol-critical state.",
    remediation:
      "Apply explicit role checks to privileged functions, test negative authorization paths, and emit events for role changes.",
    secureCodeExample: {
      language: "solidity",
      code: "function setTreasury(address treasury_) external onlyRole(DEFAULT_ADMIN_ROLE) {\n    require(treasury_ != address(0), \"ZERO_ADDRESS\");\n    treasury = treasury_;\n}",
      notes: "Privileged mutation is restricted to an explicit admin role."
    }
  },
  DELEGATECALL: {
    attack:
      "Untrusted delegatecall targets can execute in the caller storage context and overwrite critical state.",
    remediation:
      "Restrict delegatecall targets to vetted implementations, pin upgrade targets, and validate storage layout compatibility.",
    secureCodeExample: {
      language: "solidity",
      code: "require(approvedImplementation[implementation], \"UNAPPROVED_IMPLEMENTATION\");\n(bool ok, bytes memory data) = implementation.delegatecall(payload);\nrequire(ok, \"DELEGATECALL_FAILED\");",
      notes: "Delegatecall is limited to approved implementations."
    }
  },
  ORACLE_MANIPULATION: {
    attack:
      "A manipulated price source can distort collateral, swap, liquidation, or minting calculations.",
    remediation:
      "Use manipulation-resistant oracles, enforce freshness checks, and validate price deviation against secondary sources.",
    secureCodeExample: {
      language: "solidity",
      code: "require(block.timestamp - updatedAt <= MAX_ORACLE_DELAY, \"STALE_PRICE\");\nrequire(price <= maxReferencePrice && price >= minReferencePrice, \"PRICE_DEVIATION\");",
      notes: "Freshness and deviation bounds reduce oracle manipulation impact."
    }
  },
  FLASH_LOAN: {
    attack:
      "Atomic liquidity can temporarily manipulate balances, prices, or governance weight within one transaction.",
    remediation:
      "Use time-weighted measurements, pre/post invariant checks, and avoid spot-balance trust for critical decisions.",
    secureCodeExample: {
      language: "solidity",
      code: "uint256 twap = oracle.consult(asset, TWAP_WINDOW);\nrequire(twap >= minPrice && twap <= maxPrice, \"INVALID_TWAP\");",
      notes: "TWAP-based checks reduce single-block manipulation."
    }
  },
  SELFDESTRUCT: {
    attack:
      "Destructive operations may permanently disable contract logic or force unexpected ether into accounting paths.",
    remediation:
      "Remove selfdestruct paths or gate them behind timelocked, multi-party governance with explicit migration controls.",
    secureCodeExample: {
      language: "text",
      code: "Prefer pausable migration flows over selfdestruct. If retirement is required, use timelocked governance and audited asset evacuation.",
      notes: "The safest remediation is usually removing destructive code paths."
    }
  },
  UPGRADEABILITY: {
    attack:
      "Unsafe upgrade flows can introduce malicious implementations, storage collisions, or uninitialized proxy state.",
    remediation:
      "Protect upgrades with governance, initialize implementations, reserve storage gaps, and test storage compatibility.",
    secureCodeExample: {
      language: "solidity",
      code: "function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}",
      notes: "Upgrade authorization is centralized in the proxy upgrade hook."
    }
  },
  UNSAFE_EXTERNAL_CALL: {
    attack:
      "Unchecked or unsafe external calls can silently fail, trigger untrusted code, or break accounting assumptions.",
    remediation:
      "Check call return values, limit external call surface area, and isolate external interactions after state updates.",
    secureCodeExample: {
      language: "solidity",
      code: "(bool ok, bytes memory result) = target.call(data);\nrequire(ok, \"EXTERNAL_CALL_FAILED\");",
      notes: "The call result is explicitly checked before execution continues."
    }
  },
  HONEYPOT: {
    attack:
      "Trading logic may allow buying while blocking or penalizing exits for non-privileged users.",
    remediation:
      "Remove asymmetric transfer restrictions, publish tax logic, and verify sell paths through automated integration tests.",
    secureCodeExample: {
      language: "text",
      code: "Transfer restrictions should be symmetric, documented, and independently testable for buy and sell flows.",
      notes: "Token transfer policy should not depend on hidden owner-controlled exemptions."
    }
  },
  RUG_PULL: {
    attack:
      "Privileged controls may let operators drain liquidity, mint excessive supply, or block holders from exiting.",
    remediation:
      "Timelock privileged operations, cap minting, renounce unnecessary ownership powers, and lock liquidity where appropriate.",
    secureCodeExample: {
      language: "solidity",
      code: "function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {\n    require(totalSupply() + amount <= MAX_SUPPLY, \"MAX_SUPPLY\");\n    _mint(to, amount);\n}",
      notes: "Minting is role-gated and bounded by a hard supply cap."
    }
  },
  SUSPICIOUS_OWNERSHIP: {
    attack:
      "Owner-controlled logic can alter trading, supply, fees, or access after users have committed funds.",
    remediation:
      "Minimize owner privileges, use multisig governance, add timelocks, and emit transparent events for all privileged changes.",
    secureCodeExample: {
      language: "text",
      code: "Route privileged changes through multisig plus timelock, and document the exact powers retained by governance.",
      notes: "Centralization risk is reduced by transparent, delayed, multi-party administration."
    }
  },
  GAS_OPTIMIZATION: {
    attack: "This issue primarily affects operational cost rather than direct exploitability.",
    remediation: "Apply the optimization only after confirming it does not reduce readability or alter security invariants.",
    secureCodeExample: {
      language: "text",
      code: "Cache repeated storage reads and prefer calldata for external read-only array parameters when appropriate.",
      notes: "Gas improvements should be covered by regression tests."
    }
  },
  INSECURE_RANDOMNESS: {
    attack:
      "Predictable randomness can be influenced or known by block producers and adversarial callers.",
    remediation:
      "Use a commit-reveal protocol or a verifiable randomness provider for security-sensitive randomness.",
    secureCodeExample: {
      language: "text",
      code: "Use commit-reveal or verifiable randomness instead of block.timestamp, blockhash, or block.prevrandao alone.",
      notes: "Randomness must not be cheaply predictable by participants."
    }
  },
  DENIAL_OF_SERVICE: {
    attack:
      "An attacker may force critical functions to revert or exceed gas limits, blocking normal protocol operation.",
    remediation:
      "Avoid unbounded loops over user-controlled data and isolate failing external interactions.",
    secureCodeExample: {
      language: "solidity",
      code: "function process(uint256 start, uint256 count) external {\n    uint256 end = Math.min(start + count, items.length);\n    for (uint256 i = start; i < end; i++) {\n        _processItem(i);\n    }\n}",
      notes: "Batching prevents unbounded work in a single transaction."
    }
  },
  BUSINESS_LOGIC: {
    attack:
      "Protocol-specific assumptions may be violated in a way that static syntax checks cannot fully model.",
    remediation:
      "Document the invariant, add property tests, and review the impacted flow with protocol engineers.",
    secureCodeExample: {
      language: "text",
      code: "Encode the business invariant as a test or formal property and require it to hold across all state transitions.",
      notes: "Business logic fixes should be validated against protocol-specific invariants."
    }
  },
  OTHER: {
    attack:
      "The finding indicates behavior that may degrade security depending on surrounding protocol assumptions.",
    remediation: "Review the affected code, add targeted tests, and apply the analyzer recommendation where applicable.",
    secureCodeExample: {
      language: "text",
      code: "Add a regression test for the affected path, then implement the narrowest remediation that preserves intended behavior.",
      notes: "General findings require context-specific remediation."
    }
  }
};
