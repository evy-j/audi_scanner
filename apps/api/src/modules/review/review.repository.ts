import { prisma } from "../../infra/prisma/prisma.js";
import type {
  AnalyzerType,
  FindingReviewAction,
  FindingReviewStatus,
  Prisma,
  Vulnerability,
  VulnerabilitySeverity,
  VulnerabilityStatus
} from "@prisma/client";
import type {
  CodeOwnerRuleBody,
  FindingAssignmentBody,
  ReviewStatusBody,
  SuppressFindingBody,
  SuppressionRuleBody,
  UnsuppressFindingBody
} from "./review.schemas.js";
import { buildWeb3GuardSarif } from "../reports/sarif.js";

export interface ReviewActor {
  organizationId: string;
  actorUserId?: string | undefined;
}

export class ReviewRepository {
  async getReview(findingId: string, organizationId: string) {
    const finding = await this.findFindingContext(findingId, organizationId);
    if (!finding) {
      return null;
    }

    return prisma.findingReview.findUnique({
      where: { findingId },
      include: {
        events: {
          orderBy: { createdAt: "desc" },
          take: 100
        },
        comments: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 50
        },
        assignments: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 20
        },
        suppressionRule: true
      }
    });
  }

  async getReviewSummary(scanId: string, organizationId: string) {
    const scan = await prisma.scan.findFirst({
      where: { id: scanId, organizationId, deletedAt: null },
      include: {
        vulnerabilities: {
          where: { deletedAt: null },
          include: { review: true }
        }
      }
    });

    if (!scan) {
      return null;
    }

    const statusCounts = initialReviewStatusCounts();
    const severityCounts: Record<string, number> = {};
    let suppressedCount = 0;

    for (const finding of scan.vulnerabilities) {
      const status = finding.review?.status ?? "UNREVIEWED";
      statusCounts[status] += 1;
      severityCounts[finding.severity] = (severityCounts[finding.severity] ?? 0) + 1;
      if (status === "SUPPRESSED" || finding.status === "SUPPRESSED") {
        suppressedCount += 1;
      }
    }

    return {
      scanId,
      organizationId,
      projectId: scan.projectId,
      findingCount: scan.vulnerabilities.length,
      suppressedCount,
      statusCounts,
      severityCounts
    };
  }

  async changeStatus(findingId: string, actor: ReviewActor, input: ReviewStatusBody) {
    const finding = await this.findFindingContext(findingId, actor.organizationId);
    if (!finding) {
      return null;
    }
    const projectId = requireProjectId(finding.scan.projectId);

    return prisma.$transaction(async (tx) => {
      const existing = await tx.findingReview.findUnique({ where: { findingId } });
      const review = await tx.findingReview.upsert({
        where: { findingId },
        create: {
          organizationId: finding.scan.organizationId,
          projectId,
          scanId: finding.scanId,
          findingId,
          status: input.status,
          severityOverride: input.severityOverride ?? null,
          confidenceOverride: input.confidenceOverride ?? null,
          lastReviewedByUserId: actor.actorUserId ?? null,
          lastReviewedAt: new Date()
        },
        update: {
          status: input.status,
          statusBeforeSuppression: input.status === "SUPPRESSED" ? existing?.status ?? "UNREVIEWED" : null,
          severityOverride: input.severityOverride ?? existing?.severityOverride ?? null,
          confidenceOverride: input.confidenceOverride ?? existing?.confidenceOverride ?? null,
          lastReviewedByUserId: actor.actorUserId ?? null,
          lastReviewedAt: new Date()
        }
      });

      await tx.vulnerability.update({
        where: { id: findingId },
        data: { status: mapReviewStatusToVulnerabilityStatus(input.status) }
      });

      await createReviewEvent(tx, {
        organizationId: finding.scan.organizationId,
        projectId,
        scanId: finding.scanId,
        findingId,
        reviewId: review.id,
        actorUserId: actor.actorUserId,
        action: "STATUS_CHANGED",
        previousValue: {
          status: existing?.status ?? "UNREVIEWED",
          severityOverride: existing?.severityOverride ?? null,
          confidenceOverride: existing?.confidenceOverride ?? null
        },
        newValue: {
          status: input.status,
          severityOverride: input.severityOverride ?? existing?.severityOverride ?? null,
          confidenceOverride: input.confidenceOverride ?? existing?.confidenceOverride ?? null
        },
        reason: input.reason
      });

      if (input.severityOverride && input.severityOverride !== existing?.severityOverride) {
        await createReviewEvent(tx, {
          organizationId: finding.scan.organizationId,
          projectId,
          scanId: finding.scanId,
          findingId,
          reviewId: review.id,
          actorUserId: actor.actorUserId,
          action: "SEVERITY_OVERRIDDEN",
          previousValue: { severityOverride: existing?.severityOverride ?? null },
          newValue: { severityOverride: input.severityOverride },
          reason: input.reason
        });
      }

      if (input.confidenceOverride && input.confidenceOverride !== existing?.confidenceOverride) {
        await createReviewEvent(tx, {
          organizationId: finding.scan.organizationId,
          projectId,
          scanId: finding.scanId,
          findingId,
          reviewId: review.id,
          actorUserId: actor.actorUserId,
          action: "CONFIDENCE_OVERRIDDEN",
          previousValue: { confidenceOverride: existing?.confidenceOverride ?? null },
          newValue: { confidenceOverride: input.confidenceOverride },
          reason: input.reason
        });
      }

      return review;
    });
  }

  async addComment(findingId: string, actor: ReviewActor, input: { body: string }) {
    const finding = await this.findFindingContext(findingId, actor.organizationId);
    if (!finding) {
      return null;
    }
    const projectId = requireProjectId(finding.scan.projectId);

    return prisma.$transaction(async (tx) => {
      const review = await ensureReview(tx, finding, projectId, actor.actorUserId);
      const comment = await tx.findingComment.create({
        data: {
          organizationId: finding.scan.organizationId,
          projectId,
          scanId: finding.scanId,
          findingId,
          reviewId: review.id,
          actorUserId: actor.actorUserId ?? null,
          body: input.body
        }
      });
      await createReviewEvent(tx, {
        organizationId: finding.scan.organizationId,
        projectId,
        scanId: finding.scanId,
        findingId,
        reviewId: review.id,
        actorUserId: actor.actorUserId,
        action: "COMMENT_ADDED",
        previousValue: null,
        newValue: { commentId: comment.id, body: input.body },
        reason: input.body
      });
      return comment;
    });
  }

  async assignFinding(findingId: string, actor: ReviewActor, input: FindingAssignmentBody) {
    const finding = await this.findFindingContext(findingId, actor.organizationId);
    if (!finding) {
      return null;
    }
    const projectId = requireProjectId(finding.scan.projectId);

    return prisma.$transaction(async (tx) => {
      const existing = await tx.findingReview.findUnique({ where: { findingId } });
      const review = await ensureReview(tx, finding, projectId, actor.actorUserId);
      const assignment = await tx.findingAssignment.create({
        data: {
          organizationId: finding.scan.organizationId,
          projectId,
          scanId: finding.scanId,
          findingId,
          reviewId: review.id,
          actorUserId: actor.actorUserId ?? null,
          assigneeUserId: input.assigneeUserId ?? null,
          assigneeName: input.assigneeName ?? null,
          assigneeEmail: input.assigneeEmail ?? null,
          assigneeTeam: input.assigneeTeam ?? null,
          reason: input.reason ?? null
        }
      });
      const updated = await tx.findingReview.update({
        where: { id: review.id },
        data: {
          assignedToName: input.assigneeName ?? null,
          assignedToEmail: input.assigneeEmail ?? null,
          assignedToTeam: input.assigneeTeam ?? null,
          lastReviewedByUserId: actor.actorUserId ?? null,
          lastReviewedAt: new Date()
        }
      });
      await createReviewEvent(tx, {
        organizationId: finding.scan.organizationId,
        projectId,
        scanId: finding.scanId,
        findingId,
        reviewId: review.id,
        actorUserId: actor.actorUserId,
        action: "ASSIGNED",
        previousValue: {
          assignedToName: existing?.assignedToName ?? null,
          assignedToEmail: existing?.assignedToEmail ?? null,
          assignedToTeam: existing?.assignedToTeam ?? null
        },
        newValue: {
          assignmentId: assignment.id,
          assigneeUserId: input.assigneeUserId ?? null,
          assigneeName: input.assigneeName ?? null,
          assigneeEmail: input.assigneeEmail ?? null,
          assigneeTeam: input.assigneeTeam ?? null
        },
        reason: input.reason
      });
      return updated;
    });
  }

  async suppressFinding(findingId: string, actor: ReviewActor, input: SuppressFindingBody) {
    const finding = await this.findFindingContext(findingId, actor.organizationId);
    if (!finding) {
      return null;
    }
    const projectId = requireProjectId(finding.scan.projectId);

    return prisma.$transaction(async (tx) => {
      const review = await suppressFindingInTransaction(tx, finding, projectId, {
        actorUserId: actor.actorUserId,
        reason: input.reason,
        suppressionRuleId: input.ruleId
      });
      return review;
    });
  }

  async unsuppressFinding(findingId: string, actor: ReviewActor, input: UnsuppressFindingBody) {
    const finding = await this.findFindingContext(findingId, actor.organizationId);
    if (!finding) {
      return null;
    }
    const projectId = requireProjectId(finding.scan.projectId);

    return prisma.$transaction(async (tx) => {
      const existing = await tx.findingReview.findUnique({ where: { findingId } });
      const restoreStatus = existing?.statusBeforeSuppression ?? "UNREVIEWED";
      const review = await tx.findingReview.upsert({
        where: { findingId },
        create: {
          organizationId: finding.scan.organizationId,
          projectId,
          scanId: finding.scanId,
          findingId,
          status: restoreStatus,
          lastReviewedByUserId: actor.actorUserId ?? null,
          lastReviewedAt: new Date()
        },
        update: {
          status: restoreStatus,
          statusBeforeSuppression: null,
          suppressionRuleId: null,
          lastReviewedByUserId: actor.actorUserId ?? null,
          lastReviewedAt: new Date()
        }
      });

      await tx.vulnerability.update({
        where: { id: findingId },
        data: { status: mapReviewStatusToVulnerabilityStatus(restoreStatus) }
      });

      await createReviewEvent(tx, {
        organizationId: finding.scan.organizationId,
        projectId,
        scanId: finding.scanId,
        findingId,
        reviewId: review.id,
        actorUserId: actor.actorUserId,
        action: "UNSUPPRESSED",
        previousValue: { status: existing?.status ?? "SUPPRESSED" },
        newValue: { status: restoreStatus },
        reason: input.reason
      });
      return review;
    });
  }

  async listSuppressionRules(projectId: string, organizationId: string) {
    const project = await this.findProject(projectId, organizationId);
    if (!project) {
      return null;
    }

    return prisma.findingSuppressionRule.findMany({
      where: { projectId, organizationId, deletedAt: null },
      orderBy: { createdAt: "desc" }
    });
  }

  async createSuppressionRule(projectId: string, actor: ReviewActor, input: SuppressionRuleBody) {
    const project = await this.findProject(projectId, actor.organizationId);
    if (!project) {
      return null;
    }

    return prisma.$transaction(async (tx) => {
      const rule = await tx.findingSuppressionRule.create({
        data: {
          organizationId: actor.organizationId,
          projectId,
          createdByUserId: actor.actorUserId ?? null,
          analyzerName: input.analyzerName ?? null,
          ruleId: input.ruleId ?? null,
          filePath: input.filePath ?? null,
          functionName: input.functionName ?? null,
          fingerprint: input.fingerprint ?? null,
          severity: input.severity ?? null,
          messageContains: input.messageContains ?? null,
          reason: input.reason
        }
      });

      const findings = await tx.vulnerability.findMany({
        where: buildSuppressionFindingWhere(projectId, actor.organizationId, input),
        include: { scan: true, review: true }
      });

      for (const finding of findings) {
        await suppressFindingInTransaction(tx, finding, projectId, {
          actorUserId: actor.actorUserId,
          reason: input.reason,
          suppressionRuleId: rule.id
        });
      }

      return { rule, matchedFindingCount: findings.length };
    });
  }

  async deleteSuppressionRule(projectId: string, ruleId: string, organizationId: string) {
    const rule = await prisma.findingSuppressionRule.findFirst({
      where: { id: ruleId, projectId, organizationId, deletedAt: null }
    });
    if (!rule) {
      return null;
    }

    return prisma.findingSuppressionRule.update({
      where: { id: ruleId },
      data: { active: false, deletedAt: new Date() }
    });
  }

  async compareBaseline(scanId: string, organizationId: string, baseScanId?: string | undefined) {
    const currentScan = await prisma.scan.findFirst({
      where: { id: scanId, organizationId, deletedAt: null },
      include: {
        vulnerabilities: {
          where: { deletedAt: null },
          include: { review: true }
        }
      }
    });
    if (!currentScan) {
      return null;
    }
    const projectId = requireProjectId(currentScan.projectId);

    const baseScan = baseScanId
      ? await prisma.scan.findFirst({
          where: { id: baseScanId, organizationId, projectId, deletedAt: null },
          include: {
            vulnerabilities: {
              where: { deletedAt: null },
              include: { review: true }
            }
          }
        })
      : await prisma.scan.findFirst({
          where: {
            organizationId,
            projectId,
            deletedAt: null,
            status: "COMPLETED",
            createdAt: { lt: currentScan.createdAt }
          },
          orderBy: { createdAt: "desc" },
          include: {
            vulnerabilities: {
              where: { deletedAt: null },
              include: { review: true }
            }
          }
        });

    if (!baseScan) {
      return {
        scanId,
        organizationId,
        projectId,
        baseScanId: null,
        newFindings: currentScan.vulnerabilities,
        existingFindings: [],
        fixedFindings: [],
        regressedFindings: [],
        suppressedFindings: currentScan.vulnerabilities.filter(isSuppressedFinding)
      };
    }

    const baseByFingerprint = new Map(baseScan.vulnerabilities.map((finding) => [finding.fingerprint, finding]));
    const currentByFingerprint = new Map(
      currentScan.vulnerabilities.map((finding) => [finding.fingerprint, finding])
    );
    const newFindings = currentScan.vulnerabilities.filter(
      (finding) => !baseByFingerprint.has(finding.fingerprint)
    );
    const existingFindings = currentScan.vulnerabilities.filter((finding) =>
      baseByFingerprint.has(finding.fingerprint)
    );
    const fixedFindings = baseScan.vulnerabilities.filter(
      (finding) => !currentByFingerprint.has(finding.fingerprint)
    );
    const regressedFindings = existingFindings.filter((finding) => {
      const baseFinding = baseByFingerprint.get(finding.fingerprint);
      return baseFinding?.review?.status === "FIXED" || baseFinding?.status === "FIXED";
    });
    const suppressedFindings = currentScan.vulnerabilities.filter(isSuppressedFinding);

    await this.persistBaselineRows({
      organizationId,
      projectId,
      scanId,
      baseScanId: baseScan.id,
      rows: [
        ...newFindings.map((finding) => baselineRow(finding, "NEW")),
        ...existingFindings.map((finding) => baselineRow(finding, "EXISTING")),
        ...regressedFindings.map((finding) => baselineRow(finding, "REGRESSED")),
        ...suppressedFindings.map((finding) => baselineRow(finding, "SUPPRESSED")),
        ...fixedFindings.map((finding) => ({
          fingerprint: finding.fingerprint,
          baseFindingId: finding.id,
          status: "FIXED"
        }))
      ]
    });

    return {
      scanId,
      organizationId,
      projectId,
      baseScanId: baseScan.id,
      newFindings,
      existingFindings,
      fixedFindings,
      regressedFindings,
      suppressedFindings
    };
  }

  async listCodeOwnerRules(projectId: string, organizationId: string) {
    const project = await this.findProject(projectId, organizationId);
    if (!project) {
      return null;
    }

    return prisma.codeOwnerRule.findMany({
      where: { projectId, organizationId, deletedAt: null },
      orderBy: { createdAt: "desc" }
    });
  }

  async createCodeOwnerRule(projectId: string, actor: ReviewActor, input: CodeOwnerRuleBody) {
    const project = await this.findProject(projectId, actor.organizationId);
    if (!project) {
      return null;
    }

    return prisma.$transaction(async (tx) => {
      const rule = await tx.codeOwnerRule.create({
        data: {
          organizationId: actor.organizationId,
          projectId,
          createdByUserId: actor.actorUserId ?? null,
          pathPattern: input.pathPattern,
          ownerName: input.ownerName ?? null,
          ownerEmail: input.ownerEmail ?? null,
          ownerTeam: input.ownerTeam ?? null,
          severityThreshold: input.severityThreshold ?? null
        }
      });

      const candidates = await tx.vulnerability.findMany({
        where: {
          scan: { projectId, organizationId: actor.organizationId },
          deletedAt: null,
          filePath: { not: null }
        },
        include: { scan: true, review: true }
      });
      const matches = candidates.filter(
        (finding) =>
          finding.filePath &&
          matchesPathPattern(input.pathPattern, finding.filePath) &&
          matchesSeverityThreshold(finding.severity, input.severityThreshold)
      );

      for (const finding of matches) {
        await assignFindingInTransaction(tx, finding, projectId, actor.actorUserId, {
          assigneeName: input.ownerName,
          assigneeEmail: input.ownerEmail,
          assigneeTeam: input.ownerTeam,
          reason: `Matched CODEOWNERS rule ${input.pathPattern}`
        });
      }

      return { rule, matchedFindingCount: matches.length };
    });
  }

  async deleteCodeOwnerRule(projectId: string, ruleId: string, organizationId: string) {
    const rule = await prisma.codeOwnerRule.findFirst({
      where: { id: ruleId, projectId, organizationId, deletedAt: null }
    });
    if (!rule) {
      return null;
    }

    return prisma.codeOwnerRule.update({
      where: { id: ruleId },
      data: { active: false, deletedAt: new Date() }
    });
  }

  async exportSarif(scanId: string, organizationId: string, includeSuppressed: boolean) {
    const scan = await prisma.scan.findFirst({
      where: { id: scanId, organizationId, deletedAt: null },
      include: {
        vulnerabilities: {
          where: { deletedAt: null },
          include: {
            review: true,
            evidenceItems: {
              orderBy: { createdAt: "asc" },
              include: { analyzerRun: true }
            }
          }
        }
      }
    });
    if (!scan) {
      return null;
    }
    const projectId = requireProjectId(scan.projectId);
    const findings = includeSuppressed
      ? scan.vulnerabilities
      : scan.vulnerabilities.filter((finding) => !isSuppressedFinding(finding));
    const sarif = toSarif(scanId, findings);

    await prisma.$transaction(
      findings.map((finding) =>
        prisma.findingReviewEvent.create({
          data: {
            organizationId,
            projectId,
            scanId,
            findingId: finding.id,
            reviewId: finding.review?.id ?? null,
            action: "EXPORT_REQUESTED",
            newValue: toJsonObject({ format: "SARIF", includeSuppressed }),
            reason: "SARIF export requested"
          }
        })
      )
    );

    return sarif;
  }

  private findProject(projectId: string, organizationId: string) {
    return prisma.project.findFirst({
      where: { id: projectId, organizationId, deletedAt: null }
    });
  }

  private findFindingContext(findingId: string, organizationId: string) {
    return prisma.vulnerability.findFirst({
      where: {
        id: findingId,
        deletedAt: null,
        scan: { organizationId, deletedAt: null }
      },
      include: {
        scan: true,
        review: true
      }
    });
  }

  private async persistBaselineRows(input: {
    organizationId: string;
    projectId: string;
    scanId: string;
    baseScanId: string;
    rows: Array<{
      fingerprint: string;
      findingId?: string | undefined;
      baseFindingId?: string | undefined;
      status: string;
    }>;
  }) {
    if (input.rows.length === 0) {
      return;
    }

    await prisma.$transaction(
      input.rows.map((row) =>
        prisma.findingBaseline.upsert({
          where: {
            scanId_fingerprint_baselineStatus: {
              scanId: input.scanId,
              fingerprint: row.fingerprint,
              baselineStatus: row.status
            }
          },
          create: {
            organizationId: input.organizationId,
            projectId: input.projectId,
            scanId: input.scanId,
            baseScanId: input.baseScanId,
            fingerprint: row.fingerprint,
            baselineStatus: row.status,
            findingId: row.findingId ?? null,
            baseFindingId: row.baseFindingId ?? null
          },
          update: {
            baseScanId: input.baseScanId,
            findingId: row.findingId ?? null,
            baseFindingId: row.baseFindingId ?? null
          }
        })
      )
    );
  }
}

type FindingWithScan = Vulnerability & {
  scan: { id: string; organizationId: string; projectId: string | null };
  review?: { status: FindingReviewStatus; statusBeforeSuppression: FindingReviewStatus | null } | null;
};

async function ensureReview(
  tx: Prisma.TransactionClient,
  finding: FindingWithScan,
  projectId: string,
  actorUserId?: string | undefined
) {
  return tx.findingReview.upsert({
    where: { findingId: finding.id },
    create: {
      organizationId: finding.scan.organizationId,
      projectId,
      scanId: finding.scanId,
      findingId: finding.id,
      status: "UNREVIEWED",
      lastReviewedByUserId: actorUserId ?? null,
      lastReviewedAt: new Date()
    },
    update: {
      lastReviewedByUserId: actorUserId ?? null,
      lastReviewedAt: new Date()
    }
  });
}

async function suppressFindingInTransaction(
  tx: Prisma.TransactionClient,
  finding: FindingWithScan,
  projectId: string,
  input: {
    actorUserId?: string | undefined;
    reason: string;
    suppressionRuleId?: string | undefined;
  }
) {
  const existing = await tx.findingReview.findUnique({ where: { findingId: finding.id } });
  const previousStatus = existing?.status ?? "UNREVIEWED";
  const statusBeforeSuppression =
    previousStatus === "SUPPRESSED" ? existing?.statusBeforeSuppression ?? "UNREVIEWED" : previousStatus;
  const review = await tx.findingReview.upsert({
    where: { findingId: finding.id },
    create: {
      organizationId: finding.scan.organizationId,
      projectId,
      scanId: finding.scanId,
      findingId: finding.id,
      status: "SUPPRESSED",
      statusBeforeSuppression,
      suppressionRuleId: input.suppressionRuleId ?? null,
      lastReviewedByUserId: input.actorUserId ?? null,
      lastReviewedAt: new Date()
    },
    update: {
      status: "SUPPRESSED",
      statusBeforeSuppression,
      suppressionRuleId: input.suppressionRuleId ?? existing?.suppressionRuleId ?? null,
      lastReviewedByUserId: input.actorUserId ?? null,
      lastReviewedAt: new Date()
    }
  });

  await tx.vulnerability.update({
    where: { id: finding.id },
    data: { status: "SUPPRESSED" }
  });

  await createReviewEvent(tx, {
    organizationId: finding.scan.organizationId,
    projectId,
    scanId: finding.scanId,
    findingId: finding.id,
    reviewId: review.id,
    actorUserId: input.actorUserId,
    action: "SUPPRESSED",
    previousValue: { status: previousStatus },
    newValue: { status: "SUPPRESSED", suppressionRuleId: input.suppressionRuleId ?? null },
    reason: input.reason
  });

  return review;
}

async function assignFindingInTransaction(
  tx: Prisma.TransactionClient,
  finding: FindingWithScan,
  projectId: string,
  actorUserId: string | undefined,
  input: Pick<FindingAssignmentBody, "assigneeName" | "assigneeEmail" | "assigneeTeam" | "reason">
) {
  const existing = await tx.findingReview.findUnique({ where: { findingId: finding.id } });
  const review = await ensureReview(tx, finding, projectId, actorUserId);
  const assignment = await tx.findingAssignment.create({
    data: {
      organizationId: finding.scan.organizationId,
      projectId,
      scanId: finding.scanId,
      findingId: finding.id,
      reviewId: review.id,
      actorUserId: actorUserId ?? null,
      assigneeName: input.assigneeName ?? null,
      assigneeEmail: input.assigneeEmail ?? null,
      assigneeTeam: input.assigneeTeam ?? null,
      reason: input.reason ?? null
    }
  });
  await tx.findingReview.update({
    where: { id: review.id },
    data: {
      assignedToName: input.assigneeName ?? null,
      assignedToEmail: input.assigneeEmail ?? null,
      assignedToTeam: input.assigneeTeam ?? null,
      lastReviewedByUserId: actorUserId ?? null,
      lastReviewedAt: new Date()
    }
  });
  await createReviewEvent(tx, {
    organizationId: finding.scan.organizationId,
    projectId,
    scanId: finding.scanId,
    findingId: finding.id,
    reviewId: review.id,
    actorUserId,
    action: "ASSIGNED",
    previousValue: {
      assignedToName: existing?.assignedToName ?? null,
      assignedToEmail: existing?.assignedToEmail ?? null,
      assignedToTeam: existing?.assignedToTeam ?? null
    },
    newValue: {
      assignmentId: assignment.id,
      assigneeName: input.assigneeName ?? null,
      assigneeEmail: input.assigneeEmail ?? null,
      assigneeTeam: input.assigneeTeam ?? null
    },
    reason: input.reason
  });
}

function buildSuppressionFindingWhere(
  projectId: string,
  organizationId: string,
  rule: SuppressionRuleBody
): Prisma.VulnerabilityWhereInput {
  const and: Prisma.VulnerabilityWhereInput[] = [];
  if (rule.ruleId) {
    and.push({
      OR: [
        { externalRuleId: rule.ruleId },
        { detectorMetadata: { some: { ruleId: rule.ruleId } } },
        { evidenceItems: { some: { ruleId: rule.ruleId } } }
      ]
    });
  }
  if (rule.messageContains) {
    and.push({
      OR: [
        { title: { contains: rule.messageContains, mode: "insensitive" } },
        { description: { contains: rule.messageContains, mode: "insensitive" } },
        { evidenceItems: { some: { message: { contains: rule.messageContains, mode: "insensitive" } } } }
      ]
    });
  }

  return {
    scan: { projectId, organizationId },
    deletedAt: null,
    ...(and.length > 0 ? { AND: and } : {}),
    ...(rule.analyzerName ? { analyzer: toAnalyzerType(rule.analyzerName) } : {}),
    ...(rule.filePath ? { filePath: rule.filePath } : {}),
    ...(rule.functionName ? { functionName: rule.functionName } : {}),
    ...(rule.fingerprint ? { fingerprint: rule.fingerprint } : {}),
    ...(rule.severity ? { severity: rule.severity } : {})
  };
}

function toAnalyzerType(name: string): AnalyzerType {
  switch (name.toLowerCase()) {
    case "slither":
      return "SLITHER";
    case "mythril":
      return "MYTHRIL";
    case "semgrep":
      return "SEMGREP";
    case "aderyn":
      return "ADERYN";
    case "foundry":
      return "FOUNDRY";
    default:
      return name.toUpperCase() as AnalyzerType;
  }
}

function mapReviewStatusToVulnerabilityStatus(status: FindingReviewStatus): VulnerabilityStatus {
  switch (status) {
    case "FALSE_POSITIVE":
      return "FALSE_POSITIVE";
    case "RISK_ACCEPTED":
      return "ACCEPTED_RISK";
    case "FIXED":
      return "FIXED";
    case "SUPPRESSED":
      return "SUPPRESSED";
    case "ACCEPTED":
    case "NEEDS_REVIEW":
    case "UNREVIEWED":
    case "WONT_FIX":
    case "DUPLICATE":
      return "OPEN";
  }
}

function requireProjectId(projectId: string | null): string {
  if (!projectId) {
    throw new Error("Scan is not associated with a project");
  }
  return projectId;
}

function initialReviewStatusCounts(): Record<FindingReviewStatus, number> {
  return {
    UNREVIEWED: 0,
    NEEDS_REVIEW: 0,
    ACCEPTED: 0,
    FALSE_POSITIVE: 0,
    RISK_ACCEPTED: 0,
    FIXED: 0,
    WONT_FIX: 0,
    DUPLICATE: 0,
    SUPPRESSED: 0
  };
}

function isSuppressedFinding(finding: {
  status: VulnerabilityStatus;
  review?: { status: FindingReviewStatus } | null;
}): boolean {
  return finding.status === "SUPPRESSED" || finding.review?.status === "SUPPRESSED";
}

function baselineRow(finding: Vulnerability, status: string) {
  return {
    fingerprint: finding.fingerprint,
    findingId: finding.id,
    status
  };
}

const severityRank: Record<VulnerabilitySeverity, number> = {
  INFORMATIONAL: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4
};

function matchesSeverityThreshold(
  severity: VulnerabilitySeverity,
  threshold: VulnerabilitySeverity | undefined
): boolean {
  return !threshold || (severityRank[severity] ?? -1) >= (severityRank[threshold] ?? Number.POSITIVE_INFINITY);
}

function matchesPathPattern(pattern: string, filePath: string): boolean {
  const normalizedPattern = pattern.replace(/\\/gu, "/").replace(/^\//u, "");
  const normalizedPath = filePath.replace(/\\/gu, "/").replace(/^\//u, "");
  const escaped = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/gu, "\\$&")
    .replace(/\*\*/gu, ".*")
    .replace(/\*/gu, "[^/]*");
  return new RegExp(`^${escaped}$`, "u").test(normalizedPath);
}

async function createReviewEvent(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    projectId: string;
    scanId: string;
    findingId: string;
    reviewId?: string | null | undefined;
    actorUserId?: string | undefined;
    action: FindingReviewAction;
    previousValue: Record<string, unknown> | null;
    newValue: Record<string, unknown> | null;
    reason?: string | undefined;
  }
) {
  return tx.findingReviewEvent.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      scanId: input.scanId,
      findingId: input.findingId,
      reviewId: input.reviewId ?? null,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      ...(input.previousValue ? { previousValue: toJsonObject(input.previousValue) } : {}),
      ...(input.newValue ? { newValue: toJsonObject(input.newValue) } : {}),
      reason: input.reason ?? null
    }
  });
}

function toSarif(scanId: string, findings: Array<Vulnerability & { review?: { status: FindingReviewStatus } | null; evidenceItems: Array<{ analyzerRun?: { toolName: string } | null; ruleId: string | null; message: string | null; filePath: string | null; startLine: number | null; endLine: number | null; startColumn: number | null; endColumn: number | null }> }>) {
  return buildWeb3GuardSarif(scanId, findings.map((finding) => {
    const evidence = finding.evidenceItems[0];
    return {
      id: finding.id,
      title: finding.title,
      message: evidence?.message ?? finding.description ?? finding.title,
      ruleId: evidence?.ruleId ?? finding.externalRuleId ?? finding.fingerprint,
      analyzer: evidence?.analyzerRun?.toolName ?? finding.analyzer.toLowerCase(),
      category: finding.category,
      severity: finding.severity,
      fingerprint: finding.fingerprint,
      confidenceState: finding.confidenceState,
      reviewStatus: finding.review?.status ?? "UNREVIEWED",
      filePath: evidence?.filePath,
      startLine: evidence?.startLine,
      endLine: evidence?.endLine,
      startColumn: evidence?.startColumn,
      endColumn: evidence?.endColumn
    };
  }));
}

function toJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}
