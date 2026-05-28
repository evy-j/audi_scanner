import type { Request, Response } from "express";
import { ApiError } from "../../common/errors/api-error.js";
import { AiValidationService } from "./ai-validation.service.js";

export class AiValidationController {
  constructor(private readonly service = new AiValidationService()) {}

  scanSummary = async (req: Request, res: Response) => {
    res.json(await this.service.scanSummary(req.params.scanId!, requireOrganizationId(req)));
  };

  enqueueScanValidation = async (req: Request, res: Response) => {
    res.status(202).json(
      await this.service.enqueueScanValidation(req.params.scanId!, requireOrganizationId(req), req.auth?.userId)
    );
  };

  findingValidation = async (req: Request, res: Response) => {
    res.json(await this.service.findingValidation(req.params.findingId!, requireOrganizationId(req)));
  };

  enqueueFindingValidation = async (req: Request, res: Response) => {
    res.status(202).json(
      await this.service.enqueueFindingValidation(req.params.findingId!, requireOrganizationId(req), req.auth?.userId)
    );
  };
}

function requireOrganizationId(req: Request): string {
  const organizationId = req.query.organizationId;
  if (typeof organizationId !== "string") {
    throw ApiError.validation({ fieldErrors: { organizationId: ["organizationId is required"] } });
  }
  return organizationId;
}
