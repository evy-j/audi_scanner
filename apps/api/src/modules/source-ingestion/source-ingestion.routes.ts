import { Router } from "express";
import { authenticateJwtOrApiKey } from "../../common/middleware/api-key-auth.middleware.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { scanRateLimit } from "../../common/middleware/rate-limit.middleware.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { SourceIngestionController } from "./source-ingestion.controller.js";
import {
  pullRequestParams,
  pullRequestScanBody,
  repositoryIngestBody,
  repositoryParams,
  repositoryScanBody,
  sourceArtifactParams,
  sourceArtifactUploadBody,
  sourceIngestionRunParams
} from "./source-ingestion.schemas.js";

const controller = new SourceIngestionController();

export const sourceIngestionRoutes = Router();
sourceIngestionRoutes.use(authenticateJwtOrApiKey);

sourceIngestionRoutes.post(
  "/source-artifacts/upload",
  scanRateLimit,
  validateRequest({ body: sourceArtifactUploadBody }),
  asyncHandler(controller.upload)
);

sourceIngestionRoutes.get(
  "/source-artifacts/:artifactId",
  validateRequest({ params: sourceArtifactParams }),
  asyncHandler(controller.artifact)
);

sourceIngestionRoutes.get(
  "/source-artifacts/:artifactId/manifest",
  validateRequest({ params: sourceArtifactParams }),
  asyncHandler(controller.manifest)
);

sourceIngestionRoutes.post(
  "/repositories/:repositoryId/ingest",
  scanRateLimit,
  validateRequest({ params: repositoryParams, body: repositoryIngestBody }),
  asyncHandler(controller.ingestRepository)
);

sourceIngestionRoutes.post(
  "/repositories/:repositoryId/scan",
  scanRateLimit,
  validateRequest({ params: repositoryParams, body: repositoryScanBody }),
  asyncHandler(controller.scanRepository)
);

sourceIngestionRoutes.post(
  "/pull-requests/:pullRequestId/scan",
  scanRateLimit,
  validateRequest({ params: pullRequestParams, body: pullRequestScanBody }),
  asyncHandler(controller.scanPullRequest)
);

sourceIngestionRoutes.get(
  "/source-ingestion-runs/:runId",
  validateRequest({ params: sourceIngestionRunParams }),
  asyncHandler(controller.run)
);
