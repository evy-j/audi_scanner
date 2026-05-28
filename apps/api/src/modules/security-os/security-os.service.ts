
import {
  SECURITY_OS_ARTIFACT_TYPES,
  getSecurityOsDeepPhase,
  getSecurityOsDeepProgress,
  getSecurityOsPhase,
  getSecurityOsProgress,
  isSecurityOsArtifactStatus,
  isSecurityOsArtifactType,
  listSecurityOsDeepPhases,
  listSecurityOsPhases,
  type SecurityOsArtifactStatus,
  type SecurityOsArtifactType,
  type SecurityOsDeepPhaseId,
  listRealTrustOperationTemplates,
  getRealTrustOperationTemplate
} from "@audit-scanner/shared";
import { prisma } from "../../infra/prisma/prisma.js";

const APPROVAL_STATUSES = new Set<SecurityOsArtifactStatus>(["APPROVED", "PUBLISHED", "SUCCEEDED"]);

export interface CreateSecurityOsArtifactInput {
  phase: string;
  artifactType: string;
  organizationId?: string;
  projectId?: string;
  scanId?: string;
  findingId?: string;
  sourceResourceType?: string;
  sourceResourceId?: string;
  status?: string;
  title?: string;
  summary?: string;
  provenance?: unknown;
  evidenceRefs?: unknown;
  payload?: unknown;
  checksumSha256?: string;
  createdByUserId?: string;
}

export class SecurityOsService {
  list() {
    return {
      progress: getSecurityOsProgress(),
      phases: listSecurityOsPhases()
    };
  }

  get(id: string) {
    const phase = getSecurityOsPhase(id);
    return phase
      ? { phase }
      : {
          phase: null,
          error: {
            code: "PHASE_NOT_FOUND",
            message: "Tracked security OS expansion phase was not found"
          }
        };
  }

  listDeepPhases() {
    return {
      progress: getSecurityOsDeepProgress(),
      phases: listSecurityOsDeepPhases(),
      safety: {
        realOnly: true,
        note: "P15-P25+ endpoints persist real evidence and readiness artifacts only. They do not fabricate formal proofs, signed audits, trust badges, incidents, uptime, certifications, marketplace profiles, or customer traction."
      }
    };
  }

  getDeepPhase(id: string) {
    const phase = getSecurityOsDeepPhase(id);
    return phase
      ? { phase }
      : { phase: null, error: { code: "PHASE_NOT_FOUND", message: "Deep security OS phase not found" } };
  }


listRealTrustOperations() {
  return {
    phase: "P25_PLUS",
    templates: listRealTrustOperationTemplates(),
    policy: {
      realOnly: true,
      summary: "This layer tracks the real-world operations needed for company-level trust. It cannot fabricate auditors, customers, certifications, legal approvals, public track record, or uptime."
    }
  };
}

getRealTrustOperation(key: string) {
  const template = getRealTrustOperationTemplate(key);
  return template
    ? { template }
    : { template: null, error: { code: "REAL_TRUST_OPERATION_NOT_FOUND", message: "Real trust operation template was not found" } };
}

async createRealTrustOperationDefault(input: { key: string; organizationId?: string; projectId?: string; actorUserId?: string }) {
  const template = getRealTrustOperationTemplate(input.key);
  if (!template) return { artifact: null, error: { code: "REAL_TRUST_OPERATION_NOT_FOUND", message: "Real trust operation template was not found" } };
  return this.createArtifact({
    phase: "P25_PLUS",
    artifactType: template.artifactType,
    organizationId: input.organizationId,
    projectId: input.projectId,
    createdByUserId: input.actorUserId,
    status: template.safeDefaultStatus,
    title: template.title,
    summary: `Owner: ${template.recommendedOwner}. Required evidence: ${template.requiredEvidence.join(", ")}`,
    payload: {
      operationKey: template.key,
      claimPolicy: template.claimPolicy,
      requiredEvidence: template.requiredEvidence,
      blockedClaims: template.blockedClaims,
      recommendedOwner: template.recommendedOwner,
      defaultArtifact: true
    }
  });
}

  async summary(query: { organizationId?: string; projectId?: string; phase?: string }) {
    const where: any = {};
    if (query.organizationId) where.organizationId = query.organizationId;
    if (query.projectId) where.projectId = query.projectId;
    if (query.phase) where.phase = normalizePhase(query.phase);
    const [total, byPhase, byStatus] = await Promise.all([
      (prisma as any).securityOsArtifact.count({ where }),
      (prisma as any).securityOsArtifact.groupBy({ by: ["phase"], where, _count: { _all: true } }),
      (prisma as any).securityOsArtifact.groupBy({ by: ["status"], where, _count: { _all: true } })
    ]);
    return {
      total,
      byPhase,
      byStatus,
      progress: getSecurityOsDeepProgress(),
      limitations: [
        "Counts represent persisted readiness/evidence artifacts only.",
        "They are not certified audit counts, formal-proof counts, or customer-trust claims unless linked to real provenance and human sign-off."
      ]
    };
  }

  async listArtifacts(query: { organizationId?: string; projectId?: string; phase?: string; artifactType?: string; status?: string; limit?: number }) {
    const where: any = {};
    if (query.organizationId) where.organizationId = query.organizationId;
    if (query.projectId) where.projectId = query.projectId;
    if (query.phase) where.phase = normalizePhase(query.phase);
    if (query.artifactType) where.artifactType = normalizeArtifactType(query.artifactType);
    if (query.status) where.status = normalizeStatus(query.status);
    const items = await (prisma as any).securityOsArtifact.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: clampLimit(query.limit)
    });
    return { items };
  }

  async getArtifact(artifactId: string, authOrganizationId?: string) {
    const artifact = await (prisma as any).securityOsArtifact.findUnique({ where: { id: artifactId } });
    if (!artifact || (authOrganizationId && artifact.organizationId && artifact.organizationId !== authOrganizationId)) {
      return { artifact: null, error: { code: "NOT_FOUND", message: "Security OS artifact was not found" } };
    }
    return { artifact };
  }

  async createArtifact(input: CreateSecurityOsArtifactInput) {
    const phase = normalizePhase(input.phase);
    const artifactType = normalizeArtifactType(input.artifactType);
    const status = normalizeStatus(input.status ?? defaultStatusFor(artifactType));
    const phaseBlueprint = getSecurityOsDeepPhase(phase);
    const title = input.title?.trim() || defaultTitle(phase, artifactType);
    const evidenceRefs = input.evidenceRefs ?? null;
    const provenance = input.provenance ?? null;
    const policyWarnings = enforceRealOnlyPolicy(status, provenance, evidenceRefs, artifactType);
    const finalStatus = policyWarnings.length > 0 && APPROVAL_STATUSES.has(status) ? "NEEDS_HUMAN_REVIEW" : status;

    const artifact = await (prisma as any).securityOsArtifact.create({
      data: {
        phase,
        artifactType,
        organizationId: input.organizationId ?? null,
        projectId: input.projectId ?? null,
        scanId: input.scanId ?? null,
        findingId: input.findingId ?? null,
        sourceResourceType: input.sourceResourceType ?? null,
        sourceResourceId: input.sourceResourceId ?? null,
        status: finalStatus,
        title,
        summary: input.summary ?? phaseBlueprint?.objective ?? null,
        policyStatus: policyWarnings.length > 0 ? "NEEDS_REAL_EVIDENCE" : "REAL_ONLY",
        provenance: provenance as any,
        evidenceRefs: evidenceRefs as any,
        payload: {
          ...(isRecord(input.payload) ? input.payload : {}),
          safety: {
            realOnly: true,
            policyWarnings,
            fakeClaimsBlocked: phaseBlueprint?.safetyBoundaries ?? []
          }
        },
        checksumSha256: input.checksumSha256 ?? null,
        createdByUserId: input.createdByUserId ?? null
      }
    });
    await this.audit({
      phase,
      artifactId: artifact.id,
      organizationId: input.organizationId,
      projectId: input.projectId,
      actorUserId: input.createdByUserId,
      action: "SECURITY_OS_ARTIFACT_CREATED",
      metadata: { artifactType, finalStatus, policyWarnings }
    });
    return { artifact, policyWarnings };
  }

  async updateArtifactStatus(input: { artifactId: string; status: string; actorUserId?: string; organizationId?: string; reason?: string; metadata?: unknown }) {
    const status = normalizeStatus(input.status);
    const existing = await (prisma as any).securityOsArtifact.findUnique({ where: { id: input.artifactId } });
    if (!existing || (input.organizationId && existing.organizationId && existing.organizationId !== input.organizationId)) {
      return { artifact: null, error: { code: "NOT_FOUND", message: "Security OS artifact was not found" } };
    }
    const policyWarnings = enforceRealOnlyPolicy(status, existing.provenance, existing.evidenceRefs, existing.artifactType);
    const finalStatus = policyWarnings.length > 0 && APPROVAL_STATUSES.has(status) ? "NEEDS_HUMAN_REVIEW" : status;
    const artifact = await (prisma as any).securityOsArtifact.update({
      where: { id: input.artifactId },
      data: {
        status: finalStatus,
        policyStatus: policyWarnings.length > 0 ? "NEEDS_REAL_EVIDENCE" : existing.policyStatus,
        lockedAt: finalStatus === "PUBLISHED" || finalStatus === "APPROVED" ? new Date() : existing.lockedAt
      }
    });
    await this.audit({
      phase: artifact.phase,
      artifactId: artifact.id,
      organizationId: artifact.organizationId ?? input.organizationId,
      projectId: artifact.projectId ?? undefined,
      actorUserId: input.actorUserId,
      action: "SECURITY_OS_ARTIFACT_STATUS_CHANGED",
      reason: input.reason,
      metadata: { requestedStatus: status, finalStatus, policyWarnings, metadata: input.metadata }
    });
    return { artifact, policyWarnings };
  }

  async createPhaseDefaults(input: { phase: string; organizationId?: string; projectId?: string; actorUserId?: string }) {
    const phase = normalizePhase(input.phase);
    const blueprint = getSecurityOsDeepPhase(phase);
    if (!blueprint) return { created: [], error: { code: "PHASE_NOT_FOUND", message: "Deep security OS phase not found" } };
    const created = [];
    for (const capability of blueprint.capabilities) {
      const result = await this.createArtifact({
        phase,
        artifactType: capability.artifactType,
        organizationId: input.organizationId,
        projectId: input.projectId,
        createdByUserId: input.actorUserId,
        status: capability.safeDefaultStatus,
        title: `${blueprint.id} ${capability.label}`,
        summary: capability.realInputs.join(" · "),
        payload: {
          capabilityKey: capability.key,
          realInputs: capability.realInputs,
          blocksFakeClaims: capability.blocksFakeClaims,
          defaultArtifact: true
        }
      });
      created.push(result.artifact);
    }
    return { created };
  }

  async audit(input: { phase?: string; artifactId?: string; organizationId?: string | null; projectId?: string | null; actorUserId?: string; action: string; decision?: "ALLOWED" | "DENIED"; reason?: string; requestId?: string; metadata?: unknown }) {
    await (prisma as any).securityOsAuditRecord.create({
      data: {
        phase: input.phase ? normalizePhase(input.phase) : null,
        artifactId: input.artifactId ?? null,
        organizationId: input.organizationId ?? null,
        projectId: input.projectId ?? null,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        decision: input.decision ?? "ALLOWED",
        reason: input.reason ?? null,
        requestId: input.requestId ?? null,
        metadata: redactMetadata(input.metadata)
      }
    }).catch(() => undefined);
  }

  async listAudit(query: { organizationId?: string; phase?: string; limit?: number }) {
    const where: any = {};
    if (query.organizationId) where.organizationId = query.organizationId;
    if (query.phase) where.phase = normalizePhase(query.phase);
    const items = await (prisma as any).securityOsAuditRecord.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: clampLimit(query.limit)
    });
    return { items };
  }
}

export function normalizePhase(value: string): SecurityOsDeepPhaseId {
  const phase = value.trim().toUpperCase() as SecurityOsDeepPhaseId;
  if (!getSecurityOsDeepPhase(phase)) throw new Error(`Unsupported security OS phase: ${value}`);
  return phase;
}

function normalizeArtifactType(value: string): SecurityOsArtifactType {
  const normalized = value.trim().toUpperCase() as SecurityOsArtifactType;
  if (!isSecurityOsArtifactType(normalized)) throw new Error(`Unsupported security OS artifact type: ${value}`);
  return normalized;
}

function normalizeStatus(value: string): SecurityOsArtifactStatus {
  const normalized = value.trim().toUpperCase() as SecurityOsArtifactStatus;
  if (!isSecurityOsArtifactStatus(normalized)) throw new Error(`Unsupported security OS artifact status: ${value}`);
  return normalized;
}

function defaultStatusFor(artifactType: SecurityOsArtifactType): SecurityOsArtifactStatus {
  if (["FORMAL_RUN", "EVAL_RUN", "OBSERVABILITY_SNAPSHOT"].includes(artifactType)) return "NOT_ASSESSED";
  if (["AUDIT_SIGNOFF", "COMPLIANCE_EVIDENCE_PACK", "TRUST_REGISTRY_ENTRY"].includes(artifactType)) return "NEEDS_HUMAN_REVIEW";
  return "DRAFT";
}

function defaultTitle(phase: string, artifactType: string) {
  return `${phase} ${artifactType.toLowerCase().replaceAll("_", " ")}`;
}

function enforceRealOnlyPolicy(status: SecurityOsArtifactStatus, provenance: unknown, evidenceRefs: unknown, artifactType: SecurityOsArtifactType): string[] {
  const warnings: string[] = [];
  const hasProvenance = hasContent(provenance);
  const hasEvidence = hasContent(evidenceRefs);
  if (APPROVAL_STATUSES.has(status) && !hasProvenance && !hasEvidence) {
    warnings.push("Approval/publish/success status requires real provenance or evidence references. Status downgraded to NEEDS_HUMAN_REVIEW.");
  }
  if (artifactType === "FORMAL_PROOF_ARTIFACT" && status === "SUCCEEDED" && !hasEvidence) {
    warnings.push("Formal proof success requires solver/proof artifact checksum or evidence references.");
  }
  if (artifactType === "PUBLIC_SCORECARD" && status === "PUBLISHED" && !hasProvenance) {
    warnings.push("Public scorecard publishing requires explicit report/share provenance.");
  }
  return warnings;
}

function hasContent(value: unknown): boolean {
  if (!value) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return Boolean(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clampLimit(value: number | undefined): number {
  const limit = Number(value ?? 50);
  return Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 200) : 50;
}

function redactMetadata(value: unknown): unknown {
  if (!isRecord(value)) return value ?? null;
  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/secret|token|key|password|private|seed|mnemonic/i.test(key)) redacted[key] = "[REDACTED]";
    else redacted[key] = entry;
  }
  return redacted;
}
