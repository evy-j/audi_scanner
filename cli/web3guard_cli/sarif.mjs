export function buildSarif(input) {
  const findings = Array.isArray(input.findings) ? input.findings : Array.isArray(input.vulnerabilities) ? input.vulnerabilities : [];
  const rules = new Map();
  const results = findings.map((finding, index) => {
    const ruleId = finding.ruleId || finding.externalRuleId || finding.fingerprint || finding.id || `web3guard-finding-${index + 1}`;
    rules.set(ruleId, {
      id: ruleId,
      name: ruleId,
      shortDescription: { text: finding.title || ruleId },
      properties: {
        severity: finding.severity || "UNKNOWN",
        analyzer: finding.analyzer || "Web3Guard"
      }
    });
    return compact({
      ruleId,
      level: level(finding.severity),
      message: { text: finding.message || finding.description || finding.title || ruleId },
      partialFingerprints: finding.fingerprint ? { primaryLocationLineHash: finding.fingerprint } : undefined,
      locations: finding.filePath ? [{
        physicalLocation: {
          artifactLocation: { uri: finding.filePath },
          region: compact({
            startLine: finding.lineStart || finding.startLine || undefined,
            endLine: finding.lineEnd || finding.endLine || undefined,
            startColumn: finding.startColumn || undefined,
            endColumn: finding.endColumn || undefined
          })
        }
      }] : undefined,
      properties: compact({
        findingId: finding.id,
        confidence: finding.confidence,
        status: finding.status
      })
    });
  });

  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [{
      tool: {
        driver: {
          name: "Web3Guard",
          informationUri: "https://web3guard.ai",
          rules: Array.from(rules.values())
        }
      },
      results
    }]
  };
}

function level(severity) {
  if (severity === "CRITICAL" || severity === "HIGH") return "error";
  if (severity === "MEDIUM") return "warning";
  return "note";
}

function compact(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}
