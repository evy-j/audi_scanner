import type { Request, Response } from "express";
import { ApiError } from "../../common/errors/api-error.js";
import { AnalysisIrService } from "./analysis-ir.service.js";

export class AnalysisIrController {
  constructor(private readonly service = new AnalysisIrService()) {}

  summary = async (req: Request, res: Response) => {
    res.json(await this.service.summary(req.params.scanId!, requireOrganizationId(req)));
  };

  contracts = async (req: Request, res: Response) => {
    res.json(await this.service.contracts(req.params.scanId!, requireOrganizationId(req)));
  };

  functions = async (req: Request, res: Response) => {
    res.json(
      await this.service.functions(req.params.scanId!, req.params.contractId!, requireOrganizationId(req))
    );
  };

  callGraph = async (req: Request, res: Response) => {
    res.json(await this.service.callGraph(req.params.scanId!, requireOrganizationId(req)));
  };

  externalCalls = async (req: Request, res: Response) => {
    res.json(await this.service.externalCalls(req.params.scanId!, requireOrganizationId(req)));
  };

  storageLayout = async (req: Request, res: Response) => {
    res.json(await this.service.storageLayout(req.params.scanId!, requireOrganizationId(req)));
  };

  findingCodeLinks = async (req: Request, res: Response) => {
    res.json(await this.service.findingCodeLinks(req.params.findingId!, requireOrganizationId(req)));
  };
}

function requireOrganizationId(req: Request): string {
  const organizationId = req.query.organizationId;
  if (typeof organizationId !== "string") {
    throw ApiError.validation({ fieldErrors: { organizationId: ["organizationId is required"] } });
  }
  return organizationId;
}
