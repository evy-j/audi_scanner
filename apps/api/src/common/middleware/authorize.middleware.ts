import type { RequestHandler } from "express";
import { createHash } from "node:crypto";
import { prisma } from "../../infra/prisma/prisma.js";
import { asyncHandler } from "./async-handler.js";
import { ApiError } from "../errors/api-error.js";

export function requireAuth(): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(ApiError.unauthorized());
      return;
    }
    next();
  };
}

export function requirePermissions(...permissions: string[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(ApiError.unauthorized());
      return;
    }

    const granted = expandPermissions([...req.auth.permissions, ...req.auth.scopes]);
    const missing = permissions.filter((permission) => !granted.has(permission) && !permissionAliases(permission).some((alias) => granted.has(alias)));

    if (missing.length > 0) {
      void auditAccess(req, "DENIED", missing.join(","), "PERMISSION");
      next(ApiError.accessDenied("Access denied"));
      return;
    }

    next();
  };
}

export function requireOrganizationParam(paramName = "organizationId"): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    const organizationId = req.params[paramName] ?? req.body?.organizationId ?? req.query?.organizationId;

    if (!req.auth || !organizationId) {
      next(ApiError.unauthorized());
      return;
    }

    if (req.auth.organizationId && req.auth.organizationId !== organizationId) {
      void auditAccess(req, "DENIED", "organization_context", "ORGANIZATION", String(organizationId));
      next(ApiError.accessDenied("Access denied"));
      return;
    }

    if (req.auth.type === "user") {
      const membership = await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: String(organizationId),
            userId: req.auth.userId
          }
        }
      });

      if (!membership || membership.status !== "ACTIVE" || membership.deletedAt) {
        void auditAccess(req, "DENIED", "organization_membership", "ORGANIZATION", String(organizationId));
        next(ApiError.accessDenied("Access denied"));
        return;
      }

      req.auth.organizationId = String(organizationId);
      req.auth.permissions = await loadOrganizationPermissions(req.auth.userId, String(organizationId));
    }

    next();
  });
}

export function requireProjectAccess(projectParamName = "projectId"): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    if (!req.auth) {
      next(ApiError.unauthorized());
      return;
    }
    const projectId = req.params[projectParamName] ?? req.body?.projectId ?? req.query?.projectId;
    if (!projectId) {
      next();
      return;
    }
    const project = await prisma.project.findFirst({
      where: { id: String(projectId), deletedAt: null },
      select: { id: true, organizationId: true }
    });
    if (!project || project.organizationId !== req.auth.organizationId) {
      void auditAccess(req, "DENIED", "project_tenant", "PROJECT", String(projectId));
      next(ApiError.accessDenied("Access denied"));
      return;
    }
    if (req.auth.type === "apiKey" && req.auth.projectId && req.auth.projectId !== project.id) {
      void auditAccess(req, "DENIED", "api_key_project_scope", "PROJECT", project.id);
      next(ApiError.accessDenied("Access denied"));
      return;
    }
    if (req.auth.type === "user") {
      const orgRoleAllowed = req.auth.permissions.some((permission) =>
        ["org:manage", "organizations:update", "*"].includes(permission)
      );
      if (!orgRoleAllowed) {
        const membership = await prisma.projectMember.findFirst({
          where: {
            projectId: project.id,
            userId: req.auth.userId,
            status: "ACTIVE",
            deletedAt: null
          }
        });
        if (!membership) {
          void auditAccess(req, "DENIED", "project_membership", "PROJECT", project.id);
          next(ApiError.accessDenied("Access denied"));
          return;
        }
      }
    }
    next();
  });
}

export function requireScanProjectAccess(scanParamName = "scanId"): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    const scanId = req.params[scanParamName];
    if (!scanId) {
      next();
      return;
    }
    const scan = await prisma.scan.findFirst({
      where: { id: scanId, deletedAt: null },
      select: { id: true, organizationId: true, projectId: true }
    });
    if (!(await authorizeResourceProject(req, scan, "SCAN", scanId))) {
      next(ApiError.accessDenied("Access denied"));
      return;
    }
    next();
  });
}

export function requireFindingProjectAccess(findingParamName = "findingId"): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    const findingId = req.params[findingParamName];
    if (!findingId) {
      next();
      return;
    }
    const finding = await prisma.vulnerability.findFirst({
      where: { id: findingId, deletedAt: null },
      select: { id: true, scan: { select: { organizationId: true, projectId: true } } }
    });
    const resource = finding ? { id: finding.id, organizationId: finding.scan.organizationId, projectId: finding.scan.projectId } : null;
    if (!(await authorizeResourceProject(req, resource, "FINDING", findingId))) {
      next(ApiError.accessDenied("Access denied"));
      return;
    }
    next();
  });
}

export function requireReportProjectAccess(reportParamName = "reportId"): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    const reportId = req.params[reportParamName];
    if (!reportId) {
      next();
      return;
    }
    const report = await prisma.report.findFirst({
      where: { id: reportId, deletedAt: null },
      select: { id: true, organizationId: true, projectId: true }
    });
    if (!(await authorizeResourceProject(req, report, "REPORT", reportId))) {
      next(ApiError.accessDenied("Access denied"));
      return;
    }
    next();
  });
}

export function requireMonitorTargetProjectAccess(targetParamName = "targetId"): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    const targetId = req.params[targetParamName];
    if (!targetId) {
      next();
      return;
    }
    const target = await prisma.monitorTarget.findFirst({
      where: { id: targetId, deletedAt: null },
      select: { id: true, organizationId: true, projectId: true }
    });
    if (!(await authorizeResourceProject(req, target, "MONITOR_TARGET", targetId))) {
      next(ApiError.accessDenied("Access denied"));
      return;
    }
    next();
  });
}

export function requireAlertProjectAccess(alertParamName = "alertId"): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    const alertId = req.params[alertParamName];
    if (!alertId) {
      next();
      return;
    }
    const alert = await prisma.monitorAlert.findFirst({
      where: { id: alertId },
      select: { id: true, organizationId: true, projectId: true }
    });
    if (!(await authorizeResourceProject(req, alert, "MONITOR_ALERT", alertId))) {
      next(ApiError.accessDenied("Access denied"));
      return;
    }
    next();
  });
}

export function requireOrgSecuritySetting(setting: "publicReportSharingAllowed" | "simulationAllowed" | "fuzzingAllowed" | "monitoringAllowed" | "webhookAllowed"): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    const organizationId = req.auth?.organizationId ?? req.body?.organizationId ?? req.query?.organizationId ?? req.params.organizationId;
    if (!organizationId) {
      next(ApiError.unauthorized());
      return;
    }
    const security = await prisma.securitySetting.findUnique({
      where: { organizationId: String(organizationId) }
    });
    if (security && security[setting] === false) {
      void auditAccess(req, "DENIED", setting, "SECURITY_SETTING", String(organizationId));
      next(ApiError.accessDenied("Access denied"));
      return;
    }
    next();
  });
}

async function authorizeResourceProject(
  req: Parameters<RequestHandler>[0],
  resource: { id: string; organizationId: string; projectId: string | null } | null,
  resourceType: string,
  requestedId: string
): Promise<boolean> {
  if (!req.auth || !resource || resource.organizationId !== req.auth.organizationId) {
    void auditAccess(req, "DENIED", "tenant_resource", resourceType, requestedId);
    return false;
  }
  if (req.auth.type === "apiKey") {
    if (req.auth.projectId && resource.projectId !== req.auth.projectId) {
      void auditAccess(req, "DENIED", "api_key_project_scope", resourceType, resource.id);
      return false;
    }
    return true;
  }
  if (!resource.projectId || req.auth.permissions.some((permission) => ["*", "org:manage", "organizations:update"].includes(permission))) {
    return true;
  }
  const membership = await prisma.projectMember.findFirst({
    where: {
      projectId: resource.projectId,
      userId: req.auth.userId,
      status: "ACTIVE",
      deletedAt: null
    }
  });
  if (!membership) {
    void auditAccess(req, "DENIED", "project_membership", resourceType, resource.id);
    return false;
  }
  return true;
}

async function loadOrganizationPermissions(userId: string, organizationId: string): Promise<string[]> {
  const [assignments, membership] = await Promise.all([
    prisma.userRole.findMany({
    where: {
      userId,
      deletedAt: null,
      OR: [{ organizationId }, { organizationId: null }],
      role: {
        status: "ACTIVE",
        deletedAt: null
      }
    },
    include: {
      role: {
        include: {
          permissions: {
            where: { deletedAt: null },
            include: {
              permission: true
            }
          }
        }
      }
    }
    }),
    prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { roleType: true, status: true, deletedAt: true }
    })
  ]);

  const explicit = Array.from(
    new Set(
      assignments.flatMap((assignment) =>
        assignment.role.permissions
          .filter((rolePermission) => rolePermission.permission.status === "ACTIVE")
          .map((rolePermission) => rolePermission.permission.key)
      )
    )
  ).sort();
  const rolePermissions = membership && membership.status === "ACTIVE" && !membership.deletedAt
    ? permissionsForRole(membership.roleType)
    : [];
  return Array.from(new Set([...explicit, ...rolePermissions])).sort();
}

function permissionsForRole(roleType: string): string[] {
  const read = ["project:read", "repository:read", "scan:read", "finding:review", "reports:read", "vulnerabilities:read", "scans:read", "reports:read"];
  const developer = [...read, "scan:create", "repository:scan", "scans:create", "simulation:run", "fuzz:run", "vulnerabilities:update"];
  const auditor = [...read, "report:export", "report:share", "reports:export", "audit_log:read"];
  const securityLead = [...developer, ...auditor, "monitoring:manage", "repository:manage", "threat:intel:manage", "api_key:create", "api_key:revoke", "api-keys:create", "api-keys:revoke"];
  const admin = [...securityLead, "project:create", "project:update", "project:delete", "projects:create", "projects:update", "org:manage", "organizations:read", "organizations:update", "organizations:delete", "billing:manage", "audit_log:read", "api-keys:read"];
  switch (roleType) {
    case "OWNER":
      return ["*", ...admin];
    case "ADMIN":
      return admin;
    case "SECURITY_LEAD":
      return securityLead;
    case "AUDITOR":
      return auditor;
    case "DEVELOPER":
      return developer;
    case "BILLING_ADMIN":
      return [...read, "billing:manage"];
    case "VIEWER":
    case "READONLY":
    default:
      return read;
  }
}

function expandPermissions(permissions: string[]): Set<string> {
  const expanded = new Set<string>();
  for (const permission of permissions) {
    expanded.add(permission);
    for (const alias of permissionAliases(permission)) expanded.add(alias);
  }
  if (expanded.has("*")) {
    [
      "project:create", "project:read", "project:update", "project:delete",
      "repository:read", "repository:scan", "repository:manage",
      "scan:create", "scan:read", "finding:review", "finding:remediate",
      "simulation:run", "fuzz:run", "monitoring:manage", "report:export", "report:share",
      "threat:intel:manage", "api_key:create", "api_key:revoke", "org:manage", "billing:manage", "audit_log:read"
    ].forEach((permission) => expanded.add(permission));
  }
  return expanded;
}

function permissionAliases(permission: string): string[] {
  const aliases: Record<string, string[]> = {
    "api_key:create": ["api-keys:create"],
    "api_key:revoke": ["api-keys:revoke"],
    "api_key:read": ["api-keys:read"],
    "org:manage": ["organizations:read", "organizations:update", "organizations:delete"],
    "project:create": ["projects:create", "vulnerabilities:update"],
    "project:read": ["projects:read", "vulnerabilities:read"],
    "project:update": ["projects:update", "vulnerabilities:update"],
    "project:delete": ["projects:delete", "vulnerabilities:update"],
    "repository:read": ["vulnerabilities:read"],
    "repository:scan": ["scans:create"],
    "repository:manage": ["vulnerabilities:update"],
    "scan:create": ["scans:create"],
    "scan:read": ["scans:read", "vulnerabilities:read"],
    "finding:review": ["vulnerabilities:read", "vulnerabilities:update"],
    "finding:remediate": ["vulnerabilities:update"],
    "simulation:run": ["vulnerabilities:update"],
    "fuzz:run": ["vulnerabilities:update"],
    "monitoring:manage": ["vulnerabilities:update"],
    "report:export": ["reports:export"],
    "report:share": ["reports:export"],
    "threat:intel:manage": ["vulnerabilities:update"]
  };
  const reverse = Object.fromEntries(Object.entries(aliases).flatMap(([key, values]) => values.map((value) => [value, key])));
  return [...(aliases[permission] ?? []), ...(reverse[permission] ? [reverse[permission]] : [])];
}

async function auditAccess(req: Parameters<RequestHandler>[0], decision: "ALLOWED" | "DENIED", action: string, resourceType: string, resourceId?: string) {
  const organizationId = req.auth?.organizationId ?? req.query?.organizationId ?? req.body?.organizationId ?? req.params.organizationId;
  await prisma.accessAuditLog.create({
    data: {
      organizationId: organizationId ? String(organizationId) : null,
      actorUserId: req.auth?.userId ?? null,
      apiKeyId: req.auth?.type === "apiKey" ? req.auth.apiKeyId : null,
      decision,
      action,
      resourceType,
      resourceId: resourceId ?? null,
      ipHash: hashValue(req.ip),
      userAgentHash: hashValue(req.header("user-agent")),
      requestId: req.id ?? null
    }
  }).catch(() => undefined);
}

function hashValue(value: string | undefined | null): string | null {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex");
}
