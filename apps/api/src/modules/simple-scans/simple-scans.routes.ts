import { Router } from "express";
import { authenticateJwtOrApiKey } from "../../common/middleware/api-key-auth.middleware.js";
import { scanRateLimit } from "../../common/middleware/rate-limit.middleware.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { SimpleScansController } from "./simple-scans.controller.js";
import { passiveWebsiteScanBody, simplePublicRepositoryScanBody, simpleSourceUploadScanBody } from "./simple-scans.schemas.js";

const controller = new SimpleScansController();

export const simpleScanRoutes = Router();
simpleScanRoutes.use(authenticateJwtOrApiKey);

simpleScanRoutes.post(
  "/simple-scans/source-upload",
  scanRateLimit,
  validateRequest({ body: simpleSourceUploadScanBody }),
  asyncHandler(controller.sourceUpload)
);

simpleScanRoutes.post(
  "/simple-scans/public-repository",
  scanRateLimit,
  validateRequest({ body: simplePublicRepositoryScanBody }),
  asyncHandler(controller.publicRepository)
);

simpleScanRoutes.post(
  "/simple-scans/website-passive",
  scanRateLimit,
  validateRequest({ body: passiveWebsiteScanBody }),
  asyncHandler(controller.websitePassive)
);
