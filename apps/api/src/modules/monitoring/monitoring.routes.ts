import { Router } from "express";
import { authenticateJwtOrApiKey } from "../../common/middleware/api-key-auth.middleware.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import {
  requireAlertProjectAccess,
  requireMonitorTargetProjectAccess,
  requireOrganizationParam,
  requireOrgSecuritySetting,
  requirePermissions,
  requireProjectAccess,
  requireScanProjectAccess
} from "../../common/middleware/authorize.middleware.js";
import { monitorRateLimit } from "../../common/middleware/rate-limit.middleware.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { MonitoringController } from "./monitoring.controller.js";
import {
  alertCommentBody,
  alertListQuery,
  alertParams,
  alertStatusBody,
  createMonitorTargetBody,
  createWebhookBody,
  monitoringOrganizationQuery,
  monitorTargetParams,
  projectMonitorParams,
  scanMonitoringParams,
  updateMonitorTargetBody,
  webhookParams
} from "./monitoring.schemas.js";

const controller = new MonitoringController();

export const monitoringRoutes = Router();

monitoringRoutes.use(authenticateJwtOrApiKey);

monitoringRoutes.get(
  "/projects/:projectId/monitor-targets",
  validateRequest({ params: projectMonitorParams, query: monitoringOrganizationQuery }),
  requireOrganizationParam(),
  requireProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.listTargets)
);

monitoringRoutes.post(
  "/projects/:projectId/monitor-targets",
  validateRequest({ params: projectMonitorParams, query: monitoringOrganizationQuery, body: createMonitorTargetBody }),
  requireOrganizationParam(),
  requireProjectAccess(),
  requirePermissions("vulnerabilities:update"),
  requireOrgSecuritySetting("monitoringAllowed"),
  asyncHandler(controller.createTarget)
);

monitoringRoutes.patch(
  "/monitor-targets/:targetId",
  validateRequest({ params: monitorTargetParams, query: monitoringOrganizationQuery, body: updateMonitorTargetBody }),
  requireOrganizationParam(),
  requireMonitorTargetProjectAccess(),
  requirePermissions("vulnerabilities:update"),
  requireOrgSecuritySetting("monitoringAllowed"),
  asyncHandler(controller.updateTarget)
);

monitoringRoutes.delete(
  "/monitor-targets/:targetId",
  validateRequest({ params: monitorTargetParams, query: monitoringOrganizationQuery }),
  requireOrganizationParam(),
  requireMonitorTargetProjectAccess(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(controller.deleteTarget)
);

monitoringRoutes.get(
  "/projects/:projectId/alerts",
  validateRequest({ params: projectMonitorParams, query: alertListQuery }),
  requireOrganizationParam(),
  requireProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.listAlerts)
);

monitoringRoutes.get(
  "/alerts/:alertId",
  validateRequest({ params: alertParams, query: monitoringOrganizationQuery }),
  requireOrganizationParam(),
  requireAlertProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.getAlert)
);

monitoringRoutes.post(
  "/alerts/:alertId/acknowledge",
  validateRequest({ params: alertParams, query: monitoringOrganizationQuery, body: alertStatusBody }),
  requireOrganizationParam(),
  requireAlertProjectAccess(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(controller.acknowledgeAlert)
);

monitoringRoutes.post(
  "/alerts/:alertId/resolve",
  validateRequest({ params: alertParams, query: monitoringOrganizationQuery, body: alertStatusBody }),
  requireOrganizationParam(),
  requireAlertProjectAccess(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(controller.resolveAlert)
);

monitoringRoutes.post(
  "/alerts/:alertId/dismiss",
  validateRequest({ params: alertParams, query: monitoringOrganizationQuery, body: alertStatusBody }),
  requireOrganizationParam(),
  requireAlertProjectAccess(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(controller.dismissAlert)
);

monitoringRoutes.post(
  "/alerts/:alertId/comments",
  validateRequest({ params: alertParams, query: monitoringOrganizationQuery, body: alertCommentBody }),
  requireOrganizationParam(),
  requireAlertProjectAccess(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(controller.addComment)
);

monitoringRoutes.get(
  "/scans/:scanId/monitoring-summary",
  validateRequest({ params: scanMonitoringParams, query: monitoringOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.scanSummary)
);

monitoringRoutes.post(
  "/projects/:projectId/monitor/run-once",
  monitorRateLimit,
  validateRequest({ params: projectMonitorParams, query: monitoringOrganizationQuery }),
  requireOrganizationParam(),
  requireProjectAccess(),
  requirePermissions("vulnerabilities:update"),
  requireOrgSecuritySetting("monitoringAllowed"),
  asyncHandler(controller.runOnce)
);

monitoringRoutes.get(
  "/projects/:projectId/webhooks",
  validateRequest({ params: projectMonitorParams, query: monitoringOrganizationQuery }),
  requireOrganizationParam(),
  requireProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.listWebhooks)
);

monitoringRoutes.post(
  "/projects/:projectId/webhooks",
  monitorRateLimit,
  validateRequest({ params: projectMonitorParams, query: monitoringOrganizationQuery, body: createWebhookBody }),
  requireOrganizationParam(),
  requireProjectAccess(),
  requirePermissions("vulnerabilities:update"),
  requireOrgSecuritySetting("webhookAllowed"),
  asyncHandler(controller.createWebhook)
);

monitoringRoutes.delete(
  "/projects/:projectId/webhooks/:webhookId",
  validateRequest({ params: webhookParams, query: monitoringOrganizationQuery }),
  requireOrganizationParam(),
  requireProjectAccess(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(controller.deleteWebhook)
);
