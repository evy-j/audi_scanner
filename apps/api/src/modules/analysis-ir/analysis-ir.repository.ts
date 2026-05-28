import { prisma } from "../../infra/prisma/prisma.js";

export class AnalysisIrRepository {
  async summary(scanId: string, organizationId: string) {
    const scan = await prisma.scan.findFirst({
      where: { id: scanId, organizationId, deletedAt: null },
      select: {
        id: true,
        organizationId: true,
        projectId: true,
        analysisIrRuns: {
          orderBy: { createdAt: "desc" },
          take: 5
        }
      }
    });

    if (!scan) {
      return null;
    }

    const [
      contractCount,
      functionCount,
      modifierCount,
      eventCount,
      stateVariableCount,
      callGraphEdgeCount,
      externalCallCount,
      storageLayoutCount,
      sourceMapCount,
      findingCodeLinkCount
    ] = await Promise.all([
      prisma.contractSymbol.count({ where: { scanId } }),
      prisma.functionSymbol.count({ where: { scanId } }),
      prisma.modifierSymbol.count({ where: { scanId } }),
      prisma.eventSymbol.count({ where: { scanId } }),
      prisma.stateVariableSymbol.count({ where: { scanId } }),
      prisma.callGraphEdge.count({ where: { scanId } }),
      prisma.externalCallSite.count({ where: { scanId } }),
      prisma.storageLayoutEntry.count({ where: { scanId } }),
      prisma.sourceMapEntry.count({ where: { scanId } }),
      prisma.findingCodeLink.count({ where: { scanId } })
    ]);

    const latestRun = scan.analysisIrRuns[0] ?? null;

    return {
      scanId,
      organizationId,
      projectId: scan.projectId,
      extractionStatus: latestRun?.extractionStatus ?? "NOT_ASSESSED",
      latestRun,
      runs: scan.analysisIrRuns,
      contractCount,
      functionCount,
      modifierCount,
      eventCount,
      stateVariableCount,
      callGraphEdgeCount,
      externalCallCount,
      storageLayoutCount,
      sourceMapCount,
      findingCodeLinkCount
    };
  }

  async contracts(scanId: string, organizationId: string) {
    const scan = await scanExists(scanId, organizationId);
    if (!scan) {
      return null;
    }

    return prisma.contractSymbol.findMany({
      where: { scanId },
      orderBy: [{ filePath: "asc" }, { startLine: "asc" }, { name: "asc" }],
      include: {
        _count: {
          select: {
            functions: true,
            modifiers: true,
            stateVariables: true,
            events: true,
            codeLinks: true
          }
        }
      }
    });
  }

  async functions(scanId: string, contractId: string, organizationId: string) {
    const contract = await prisma.contractSymbol.findFirst({
      where: {
        id: contractId,
        scanId,
        scan: {
          organizationId,
          deletedAt: null
        }
      },
      select: { id: true }
    });

    if (!contract) {
      return null;
    }

    return prisma.functionSymbol.findMany({
      where: { scanId, contractSymbolId: contractId },
      orderBy: [{ startLine: "asc" }, { name: "asc" }]
    });
  }

  async callGraph(scanId: string, organizationId: string) {
    const scan = await scanExists(scanId, organizationId);
    if (!scan) {
      return null;
    }

    return prisma.callGraphEdge.findMany({
      where: { scanId },
      orderBy: [{ fromContract: "asc" }, { fromFunction: "asc" }, { startLine: "asc" }],
      include: {
        fromFunctionSymbol: true,
        toFunctionSymbol: true
      }
    });
  }

  async externalCalls(scanId: string, organizationId: string) {
    const scan = await scanExists(scanId, organizationId);
    if (!scan) {
      return null;
    }

    return prisma.externalCallSite.findMany({
      where: { scanId },
      orderBy: [{ contractName: "asc" }, { functionName: "asc" }, { startLine: "asc" }]
    });
  }

  async storageLayout(scanId: string, organizationId: string) {
    const scan = await scanExists(scanId, organizationId);
    if (!scan) {
      return null;
    }

    return prisma.storageLayoutEntry.findMany({
      where: { scanId },
      orderBy: [{ contractName: "asc" }, { slot: "asc" }, { offset: "asc" }, { label: "asc" }]
    });
  }

  async findingCodeLinks(findingId: string, organizationId: string) {
    const finding = await prisma.vulnerability.findFirst({
      where: {
        id: findingId,
        deletedAt: null,
        scan: {
          organizationId,
          deletedAt: null
        }
      },
      select: { id: true }
    });

    if (!finding) {
      return null;
    }

    return prisma.findingCodeLink.findMany({
      where: { findingId },
      orderBy: [{ linkType: "asc" }, { confidence: "desc" }, { createdAt: "asc" }],
      include: {
        analysisIrRun: true,
        contractSymbol: true,
        functionSymbol: true,
        externalCallSite: true,
        storageLayoutEntry: true
      }
    });
  }
}

async function scanExists(scanId: string, organizationId: string): Promise<boolean> {
  const scan = await prisma.scan.findFirst({
    where: { id: scanId, organizationId, deletedAt: null },
    select: { id: true }
  });
  return Boolean(scan);
}
