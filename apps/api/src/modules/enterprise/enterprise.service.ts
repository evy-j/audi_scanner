import { createHash } from "node:crypto";
import type {
  EnterpriseRoleType,
  OrganizationMemberStatus,
  ProjectMemberStatus,
  SsoConnectionStatus,
  SsoProviderKind
} from "@prisma/client";
import { ApiError } from "../../common/errors/api-error.js";
import { redactSecretLikeValues } from "../../common/logging/redaction.js";
import { prisma } from "../../infra/prisma/prisma.js";
import { BillingEntitlementService, ENTITLEMENT_KEYS } from "../billing/entitlements.service.js";

export interface EnterpriseActor {
  organizationId: string;
  actorUserId?: string | undefined;
}

type SsoInput = {
  providerKind?: SsoProviderKind | undefined;
  issuerUrl?: string | undefined;
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  allowedDomains?: string[] | undefined;
  status?: SsoConnectionStatus | undefined;
};

type RetentionInput = {
  scanArtifactRetentionDays?: number | undefined;
  reportRetentionDays?: number | undefined;
  auditLogRetentionDays?: number | undefined;
};

type SecuritySettingsInput = {
  require2fa?: boolean | undefined;
  sessionTimeoutMinutes?: number | undefined;
  allowedDomains?: string[] | undefined;
  apiKeyMaxLifetimeDays?: number | undefined;
  publicReportSharingAllowed?: boolean | undefined;
  webhookAllowed?: boolean | undefined;
  simulationAllowed?: boolean | undefined;
  fuzzingAllowed?: boolean | undefined;
  monitoringAllowed?: boolean | undefined;
};

export class EnterpriseService {
  private readonly entitlements = new BillingEntitlementService();

  async members(orgId: string) {
    return prisma.organizationMember.findMany({
      where: { organizationId: orgId, deletedAt: null },
      include: { user: { select: { id: true, email: true, displayName: true, status: true } } },
      orderBy: { createdAt: "desc" }
    });
  }

  async inviteMember(orgId: string, actor: EnterpriseActor, input: { email: string; roleType: EnterpriseRoleType; title?: string }) {
    const activeMemberCount = await prisma.organizationMember.count({
      where: { organizationId: orgId, status: "ACTIVE", deletedAt: null }
    });
    await this.entitlements.assertMaxAllowed(orgId, ENTITLEMENT_KEYS.teamMembersMax, activeMemberCount, 1, {
      resourceType: "ORGANIZATION_MEMBER",
      actorUserId: actor.actorUserId
    });
    const user = await prisma.user.upsert({
      where: { email: input.email.toLowerCase() },
      update: {},
      create: { email: input.email.toLowerCase(), status: "PENDING" }
    });
    const member = await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
      update: {
        roleType: input.roleType,
        status: "INVITED",
        invitedEmail: input.email.toLowerCase(),
        invitedByUserId: actor.actorUserId ?? null,
        title: input.title ?? null,
        deletedAt: null
      },
      create: {
        organizationId: orgId,
        userId: user.id,
        roleType: input.roleType,
        status: "INVITED",
        invitedEmail: input.email.toLowerCase(),
        invitedByUserId: actor.actorUserId ?? null,
        title: input.title ?? null
      },
      include: { user: { select: { id: true, email: true, displayName: true, status: true } } }
    });
    await this.adminEvent(orgId, actor, "MEMBER_INVITE", "ORGANIZATION_MEMBER", member.id, { email: input.email, roleType: input.roleType, emailSent: false });
    return { member, emailSent: false };
  }

  async updateMember(orgId: string, memberId: string, actor: EnterpriseActor, input: { roleType?: EnterpriseRoleType; status?: OrganizationMemberStatus; title?: string }) {
    const member = await prisma.organizationMember.findFirst({ where: { id: memberId, organizationId: orgId, deletedAt: null } });
    if (!member) throw ApiError.accessDenied("Access denied");
    if (member.roleType === "OWNER" && input.roleType && input.roleType !== "OWNER") {
      await this.assertNotLastOwner(orgId, member.userId);
    }
    const updated = await prisma.organizationMember.update({
      where: { id: member.id },
      data: {
        ...(input.roleType ? { roleType: input.roleType } : {}),
        ...(input.status ? { status: input.status, deletedAt: input.status === "REMOVED" ? new Date() : null } : {}),
        ...(input.title !== undefined ? { title: input.title } : {})
      },
      include: { user: { select: { id: true, email: true, displayName: true, status: true } } }
    });
    await this.adminEvent(orgId, actor, "MEMBER_UPDATE", "ORGANIZATION_MEMBER", member.id, { before: member.roleType, after: input.roleType ?? member.roleType });
    return updated;
  }

  async removeMember(orgId: string, memberId: string, actor: EnterpriseActor) {
    const member = await prisma.organizationMember.findFirst({ where: { id: memberId, organizationId: orgId, deletedAt: null } });
    if (!member) throw ApiError.accessDenied("Access denied");
    if (member.roleType === "OWNER") await this.assertNotLastOwner(orgId, member.userId);
    await prisma.organizationMember.update({
      where: { id: member.id },
      data: { status: "REMOVED", deletedAt: new Date() }
    });
    await this.adminEvent(orgId, actor, "MEMBER_REMOVE", "ORGANIZATION_MEMBER", member.id, {});
    return { ok: true };
  }

  listProjectMembers(projectId: string, organizationId: string) {
    return prisma.projectMember.findMany({
      where: { projectId, organizationId, deletedAt: null },
      include: { user: { select: { id: true, email: true, displayName: true, status: true } } },
      orderBy: { createdAt: "desc" }
    });
  }

  async addProjectMember(projectId: string, actor: EnterpriseActor, input: { userId: string; roleType: EnterpriseRoleType }) {
    const project = await this.project(projectId, actor.organizationId);
    const orgMember = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: actor.organizationId, userId: input.userId } }
    });
    if (!orgMember || orgMember.deletedAt || orgMember.status === "REMOVED") throw ApiError.badRequest("User is not an active organization member");
    const member = await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: input.userId } },
      update: { roleType: input.roleType, status: "ACTIVE", deletedAt: null },
      create: { organizationId: actor.organizationId, projectId: project.id, userId: input.userId, roleType: input.roleType },
      include: { user: { select: { id: true, email: true, displayName: true, status: true } } }
    });
    await this.adminEvent(actor.organizationId, actor, "PROJECT_MEMBER_ADD", "PROJECT_MEMBER", member.id, { projectId, roleType: input.roleType });
    return member;
  }

  async updateProjectMember(projectId: string, memberId: string, actor: EnterpriseActor, input: { roleType?: EnterpriseRoleType; status?: ProjectMemberStatus }) {
    await this.project(projectId, actor.organizationId);
    const result = await prisma.projectMember.updateMany({
      where: { id: memberId, projectId, organizationId: actor.organizationId, deletedAt: null },
      data: {
        ...(input.roleType ? { roleType: input.roleType } : {}),
        ...(input.status ? { status: input.status, deletedAt: input.status === "REMOVED" ? new Date() : null } : {})
      }
    });
    if (result.count === 0) throw ApiError.accessDenied("Access denied");
    await this.adminEvent(actor.organizationId, actor, "PROJECT_MEMBER_UPDATE", "PROJECT_MEMBER", memberId, { projectId, input });
    return prisma.projectMember.findFirst({ where: { id: memberId, projectId }, include: { user: { select: { id: true, email: true, displayName: true, status: true } } } });
  }

  async removeProjectMember(projectId: string, memberId: string, actor: EnterpriseActor) {
    await this.project(projectId, actor.organizationId);
    const result = await prisma.projectMember.updateMany({
      where: { id: memberId, projectId, organizationId: actor.organizationId, deletedAt: null },
      data: { status: "REMOVED", deletedAt: new Date() }
    });
    if (result.count === 0) throw ApiError.accessDenied("Access denied");
    await this.adminEvent(actor.organizationId, actor, "PROJECT_MEMBER_REMOVE", "PROJECT_MEMBER", memberId, { projectId });
    return { ok: true };
  }

  async auditLogs(orgId: string, limit: number) {
    const [legacy, access, admin, apiKeys] = await Promise.all([
      prisma.auditLog.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, take: limit }),
      prisma.accessAuditLog.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, take: limit }),
      prisma.adminActionEvent.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, take: limit }),
      prisma.apiKeyAuditEvent.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, take: limit })
    ]);
    return { legacy, access, admin, apiKeys };
  }

  async getSso(orgId: string) {
    const connection = await prisma.ssoConnection.findFirst({ where: { organizationId: orgId, deletedAt: null }, orderBy: { createdAt: "desc" } });
    return connection ?? { organizationId: orgId, status: "NOT_CONFIGURED", providerKind: "OIDC", activeLoginFlow: false };
  }

  async upsertSso(orgId: string, actor: EnterpriseActor, input: SsoInput) {
    const existing = await prisma.ssoConnection.findFirst({ where: { organizationId: orgId, deletedAt: null }, orderBy: { createdAt: "desc" } });
    const status = input.status === "ACTIVE" ? "CONFIGURED_NOT_ACTIVE" : (input.status ?? existing?.status ?? "CONFIGURED_NOT_ACTIVE");
    const data = {
      providerKind: input.providerKind ?? existing?.providerKind ?? "OIDC",
      status,
      issuerUrl: input.issuerUrl ?? existing?.issuerUrl ?? null,
      clientId: input.clientId ?? existing?.clientId ?? null,
      ...(input.clientSecret ? { clientSecretHash: hash(input.clientSecret) } : {}),
      allowedDomains: input.allowedDomains ?? existing?.allowedDomains ?? []
    };
    const connection = existing
      ? await prisma.ssoConnection.update({ where: { id: existing.id }, data })
      : await prisma.ssoConnection.create({ data: { organizationId: orgId, ...data } });
    await this.adminEvent(orgId, actor, "SSO_CONFIGURE", "SSO_CONNECTION", connection.id, { status: connection.status, activeLoginFlow: false });
    return { ...connection, activeLoginFlow: false };
  }

  async deleteSso(orgId: string, actor: EnterpriseActor) {
    await prisma.ssoConnection.updateMany({ where: { organizationId: orgId, deletedAt: null }, data: { status: "DISABLED", deletedAt: new Date() } });
    await this.adminEvent(orgId, actor, "SSO_DELETE", "SSO_CONNECTION", orgId, { activeLoginFlow: false });
    return { ok: true, status: "NOT_CONFIGURED" };
  }

  async getRetention(orgId: string) {
    return prisma.dataRetentionPolicy.upsert({
      where: { organizationId: orgId },
      update: {},
      create: { organizationId: orgId }
    });
  }

  async updateRetention(orgId: string, actor: EnterpriseActor, input: RetentionInput) {
    const data = {
      ...(input.scanArtifactRetentionDays !== undefined ? { scanArtifactRetentionDays: input.scanArtifactRetentionDays } : {}),
      ...(input.reportRetentionDays !== undefined ? { reportRetentionDays: input.reportRetentionDays } : {}),
      ...(input.auditLogRetentionDays !== undefined ? { auditLogRetentionDays: input.auditLogRetentionDays } : {})
    };
    const policy = await prisma.dataRetentionPolicy.upsert({
      where: { organizationId: orgId },
      update: data,
      create: { organizationId: orgId, ...data }
    });
    await this.adminEvent(orgId, actor, "DATA_RETENTION_UPDATE", "DATA_RETENTION_POLICY", policy.id, input);
    return policy;
  }

  async createExportRequest(orgId: string, actor: EnterpriseActor, input: { projectId?: string; scope: string; reason?: string }) {
    if (input.projectId) await this.project(input.projectId, orgId);
    const request = await prisma.dataExportRequest.create({
      data: { organizationId: orgId, projectId: input.projectId ?? null, requestedById: actor.actorUserId ?? null, scope: input.scope, reason: input.reason ?? null, status: "PENDING" }
    });
    await this.adminEvent(orgId, actor, "DATA_EXPORT_REQUEST", "DATA_EXPORT_REQUEST", request.id, input);
    return request;
  }

  async createDeletionRequest(orgId: string, actor: EnterpriseActor, input: { projectId?: string; scope: string; reason: string }) {
    if (input.projectId) await this.project(input.projectId, orgId);
    const request = await prisma.dataDeletionRequest.create({
      data: { organizationId: orgId, projectId: input.projectId ?? null, requestedById: actor.actorUserId ?? null, scope: input.scope, reason: input.reason, status: "PENDING" }
    });
    await this.adminEvent(orgId, actor, "DATA_DELETION_REQUEST", "DATA_DELETION_REQUEST", request.id, input);
    return request;
  }

  async getSecuritySettings(orgId: string) {
    return prisma.securitySetting.upsert({ where: { organizationId: orgId }, update: {}, create: { organizationId: orgId } });
  }

  async updateSecuritySettings(orgId: string, actor: EnterpriseActor, input: SecuritySettingsInput) {
    const data = {
      ...(input.require2fa !== undefined ? { require2fa: input.require2fa } : {}),
      ...(input.sessionTimeoutMinutes !== undefined ? { sessionTimeoutMinutes: input.sessionTimeoutMinutes } : {}),
      ...(input.allowedDomains !== undefined ? { allowedDomains: input.allowedDomains } : {}),
      ...(input.apiKeyMaxLifetimeDays !== undefined ? { apiKeyMaxLifetimeDays: input.apiKeyMaxLifetimeDays } : {}),
      ...(input.publicReportSharingAllowed !== undefined ? { publicReportSharingAllowed: input.publicReportSharingAllowed } : {}),
      ...(input.webhookAllowed !== undefined ? { webhookAllowed: input.webhookAllowed } : {}),
      ...(input.simulationAllowed !== undefined ? { simulationAllowed: input.simulationAllowed } : {}),
      ...(input.fuzzingAllowed !== undefined ? { fuzzingAllowed: input.fuzzingAllowed } : {}),
      ...(input.monitoringAllowed !== undefined ? { monitoringAllowed: input.monitoringAllowed } : {})
    };
    const settings = await prisma.securitySetting.upsert({
      where: { organizationId: orgId },
      update: data,
      create: { organizationId: orgId, ...data }
    });
    await this.adminEvent(orgId, actor, "SECURITY_SETTINGS_UPDATE", "SECURITY_SETTING", settings.id, redactSecretLikeValues(input));
    return settings;
  }

  private async assertNotLastOwner(orgId: string, userId: string) {
    const owners = await prisma.organizationMember.count({
      where: { organizationId: orgId, roleType: "OWNER", status: "ACTIVE", deletedAt: null }
    });
    const member = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: orgId, userId } } });
    if (member?.roleType === "OWNER" && owners <= 1) {
      throw ApiError.badRequest("Cannot remove or demote the last organization owner");
    }
  }

  private async project(projectId: string, organizationId: string) {
    const project = await prisma.project.findFirst({ where: { id: projectId, organizationId, deletedAt: null }, select: { id: true } });
    if (!project) throw ApiError.accessDenied("Access denied");
    return project;
  }

  private async adminEvent(orgId: string, actor: EnterpriseActor, action: string, resourceType: string, resourceId: string, metadata: unknown) {
    await prisma.adminActionEvent.create({
      data: {
        organizationId: orgId,
        actorUserId: actor.actorUserId ?? null,
        action,
        resourceType,
        resourceId,
        metadata: toJson(redactSecretLikeValues(metadata))
      }
    });
  }
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}
