import { Router } from "express";
import { authenticateJwtOrApiKey } from "../../common/middleware/api-key-auth.middleware.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { requireOrganizationParam, requirePermissions } from "../../common/middleware/authorize.middleware.js";
import { scanRateLimit } from "../../common/middleware/rate-limit.middleware.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { GitHubIntegrationController } from "./github.controller.js";
import {
  connectInstallationBody,
  connectRepositoryBody,
  orgParams,
  repoParams,
  repositoryScanBody
} from "./github.schemas.js";

const controller = new GitHubIntegrationController();

export const githubWebhookRoutes = Router();
githubWebhookRoutes.post("/github/webhook", asyncHandler(controller.webhook));

export const githubIntegrationRoutes = Router();
githubIntegrationRoutes.use(authenticateJwtOrApiKey);

githubIntegrationRoutes.get(
  "/integrations/github/status",
  asyncHandler(controller.status)
);

githubIntegrationRoutes.get(
  "/orgs/:orgId/integrations/github/installations",
  validateRequest({ params: orgParams }),
  requireOrganizationParam("orgId"),
  requirePermissions("repository:read"),
  asyncHandler(controller.installations)
);

githubIntegrationRoutes.post(
  "/orgs/:orgId/integrations/github/installations/connect",
  validateRequest({ params: orgParams, body: connectInstallationBody }),
  requireOrganizationParam("orgId"),
  requirePermissions("repository:manage"),
  asyncHandler(controller.connectInstallation)
);

githubIntegrationRoutes.get(
  "/orgs/:orgId/repositories",
  validateRequest({ params: orgParams }),
  requireOrganizationParam("orgId"),
  requirePermissions("repository:read"),
  asyncHandler(controller.repositories)
);

githubIntegrationRoutes.post(
  "/orgs/:orgId/repositories",
  validateRequest({ params: orgParams, body: connectRepositoryBody }),
  requireOrganizationParam("orgId"),
  requirePermissions("repository:manage"),
  asyncHandler(controller.connectRepository)
);

githubIntegrationRoutes.post(
  "/orgs/:orgId/repositories/:repoId/scan",
  scanRateLimit,
  validateRequest({ params: repoParams, body: repositoryScanBody }),
  requireOrganizationParam("orgId"),
  requirePermissions("repository:scan"),
  asyncHandler(controller.scanRepository)
);

githubIntegrationRoutes.get(
  "/orgs/:orgId/repositories/:repoId/scans",
  validateRequest({ params: repoParams }),
  requireOrganizationParam("orgId"),
  requirePermissions("repository:read"),
  asyncHandler(controller.repositoryScans)
);
