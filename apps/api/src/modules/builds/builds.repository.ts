import { prisma } from "../../infra/prisma/prisma.js";

export class BuildsRepository {
  async buildProfile(scanId: string, organizationId: string) {
    const scan = await this.scanContext(scanId, organizationId);
    if (!scan) return undefined;
    return prisma.buildProfile.findFirst({
      where: { scanId },
      orderBy: { createdAt: "desc" }
    });
  }

  async buildRuns(scanId: string, organizationId: string) {
    const scan = await this.scanContext(scanId, organizationId);
    if (!scan) return null;
    return prisma.buildRun.findMany({
      where: { scanId },
      orderBy: { startedAt: "desc" },
      include: {
        compilerArtifacts: true,
        testRuns: {
          include: { results: true },
          orderBy: { startedAt: "desc" }
        }
      }
    });
  }

  async compilerArtifacts(scanId: string, organizationId: string) {
    const scan = await this.scanContext(scanId, organizationId);
    if (!scan) return null;
    return prisma.compilerArtifact.findMany({
      where: { scanId },
      orderBy: [{ createdAt: "desc" }, { artifactPath: "asc" }]
    });
  }

  async testRuns(scanId: string, organizationId: string) {
    const scan = await this.scanContext(scanId, organizationId);
    if (!scan) return null;
    return prisma.testRun.findMany({
      where: { scanId },
      orderBy: { startedAt: "desc" },
      include: { results: true }
    });
  }

  async toolAvailability(scanId: string, organizationId: string) {
    const scan = await this.scanContext(scanId, organizationId);
    if (!scan) return null;
    return prisma.analyzerToolAvailability.findMany({
      where: { scanId },
      orderBy: [{ toolName: "asc" }, { checkedAt: "desc" }]
    });
  }

  async retryContext(scanId: string, organizationId: string) {
    const scan = await prisma.scan.findFirst({
      where: { id: scanId, organizationId, deletedAt: null },
      include: {
        analyzerRuns: {
          orderBy: { startedAt: "desc" },
          take: 5
        },
        buildProfiles: {
          orderBy: { createdAt: "desc" },
          take: 1
        },
        events: {
          orderBy: [{ sequence: "asc" }, { emittedAt: "asc" }]
        }
      }
    });
    if (!scan) return null;

    return {
      scan,
      preparedArtifactKey:
        metadataString(scan.buildProfiles[0]?.metadata, "preparedArtifactKey") ??
        scan.analyzerRuns.map((run) => metadataString(run.metadata, "preparedArtifactKey")).find(Boolean) ??
        `prepared-sources/${organizationId}/${scanId}`,
      analyzers: eventAnalyzers(scan.events) ?? ["slither", "mythril", "semgrep"]
    };
  }

  private async scanContext(scanId: string, organizationId: string) {
    return prisma.scan.findFirst({
      where: { id: scanId, organizationId, deletedAt: null },
      select: { id: true }
    });
  }
}

function metadataString(metadata: unknown, key: string): string | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function eventAnalyzers(events: Array<{ data: unknown }>): Array<"slither" | "mythril" | "semgrep" | "aderyn" | "foundry"> | undefined {
  for (const event of events) {
    if (!event.data || typeof event.data !== "object" || Array.isArray(event.data)) {
      continue;
    }
    const analyzers = (event.data as Record<string, unknown>).analyzers;
    if (Array.isArray(analyzers)) {
      return analyzers.filter(isAnalyzer);
    }
  }
  return undefined;
}

function isAnalyzer(value: unknown): value is "slither" | "mythril" | "semgrep" | "aderyn" | "foundry" {
  return value === "slither" || value === "mythril" || value === "semgrep" || value === "aderyn" || value === "foundry";
}
