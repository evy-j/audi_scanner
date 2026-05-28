import { Router } from "express";
import { authenticateJwtOrApiKey } from "../../common/middleware/api-key-auth.middleware.js";
import {
  requireOrganizationParam,
  requireOrgSecuritySetting,
  requirePermissions,
  requireReportProjectAccess
} from "../../common/middleware/authorize.middleware.js";
import { reportRateLimit } from "../../common/middleware/rate-limit.middleware.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import {
  listReportsQuery,
  publicReportParams,
  reportExportBody,
  reportParams,
  reportShareBody
} from "./reports.schemas.js";
import { ReportsController } from "./reports.controller.js";
import { organizationQuery } from "../../common/validation/common-schemas.js";

const controller = new ReportsController();

export const reportRoutes = Router();

reportRoutes.use(authenticateJwtOrApiKey);

reportRoutes.get(
  "/",
  validateRequest({ query: listReportsQuery }),
  requireOrganizationParam(),
  requirePermissions("reports:read"),
  asyncHandler(controller.list)
);

reportRoutes.get(
  "/:reportId",
  validateRequest({ params: reportParams, query: organizationQuery }),
  requireOrganizationParam(),
  requireReportProjectAccess(),
  requirePermissions("reports:read"),
  asyncHandler(controller.get)
);

reportRoutes.post(
  "/:reportId/export",
  reportRateLimit,
  validateRequest({ params: reportParams, query: organizationQuery, body: reportExportBody }),
  requireOrganizationParam(),
  requireReportProjectAccess(),
  requirePermissions("reports:export"),
  asyncHandler(controller.export)
);

reportRoutes.post(
  "/:reportId/share",
  reportRateLimit,
  validateRequest({ params: reportParams, query: organizationQuery, body: reportShareBody }),
  requireOrganizationParam(),
  requireReportProjectAccess(),
  requirePermissions("report:share"),
  requireOrgSecuritySetting("publicReportSharingAllowed"),
  asyncHandler(controller.share)
);

reportRoutes.post(
  "/:reportId/revoke-share",
  reportRateLimit,
  validateRequest({ params: reportParams, query: organizationQuery }),
  requireOrganizationParam(),
  requireReportProjectAccess(),
  requirePermissions("reports:export"),
  asyncHandler(controller.revokeShare)
);

reportRoutes.get(
  "/:reportId/pdf",
  validateRequest({ params: reportParams, query: organizationQuery }),
  requireOrganizationParam(),
  requireReportProjectAccess(),
  requirePermissions("reports:export"),
  asyncHandler(controller.pdf)
);

export const publicReportRoutes = Router();

publicReportRoutes.get(
  "/:shareToken",
  validateRequest({ params: publicReportParams }),
  asyncHandler(controller.publicReport)
);
