export interface SarifFindingInput {
  id?: string | undefined;
  title: string;
  message?: string | null | undefined;
  description?: string | null | undefined;
  ruleId?: string | null | undefined;
  analyzer?: string | null | undefined;
  category?: string | null | undefined;
  severity?: string | null | undefined;
  fingerprint?: string | null | undefined;
  confidenceState?: string | null | undefined;
  reviewStatus?: string | null | undefined;
  filePath?: string | null | undefined;
  startLine?: number | null | undefined;
  endLine?: number | null | undefined;
  startColumn?: number | null | undefined;
  endColumn?: number | null | undefined;
}

export function buildWeb3GuardSarif(scanId: string, findings: SarifFindingInput[]) {
  const rules = new Map<string, Record<string, unknown>>();
  const results = findings.map((finding, index) => {
    const ruleId = finding.ruleId ?? finding.fingerprint ?? finding.id ?? `web3guard-finding-${index + 1}`;
    rules.set(ruleId, {
      id: ruleId,
      name: ruleId,
      shortDescription: { text: finding.title },
      properties: {
        analyzer: finding.analyzer ?? "Web3Guard",
        severity: finding.severity ?? "UNKNOWN",
        category: finding.category ?? "UNKNOWN"
      }
    });

    return {
      ruleId,
      level: sarifLevel(finding.severity),
      message: { text: finding.message ?? finding.description ?? finding.title },
      partialFingerprints: finding.fingerprint ? { primaryLocationLineHash: finding.fingerprint } : undefined,
      ...(finding.filePath
        ? {
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: finding.filePath },
                  region: compact({
                    startLine: finding.startLine ?? undefined,
                    endLine: finding.endLine ?? undefined,
                    startColumn: finding.startColumn ?? undefined,
                    endColumn: finding.endColumn ?? undefined
                  })
                }
              }
            ]
          }
        : {}),
      properties: compact({
        analyzer: finding.analyzer ?? undefined,
        findingId: finding.id ?? undefined,
        fingerprint: finding.fingerprint ?? undefined,
        confidenceState: finding.confidenceState ?? undefined,
        reviewStatus: finding.reviewStatus ?? undefined
      })
    };
  }).map(compact);

  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "Web3Guard",
            informationUri: "https://web3guard.ai",
            rules: Array.from(rules.values())
          }
        },
        automationDetails: { id: scanId },
        results
      }
    ]
  };
}

function sarifLevel(severity?: string | null): "error" | "warning" | "note" {
  switch (severity) {
    case "CRITICAL":
    case "HIGH":
      return "error";
    case "MEDIUM":
      return "warning";
    default:
      return "note";
  }
}

function compact<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T;
}
