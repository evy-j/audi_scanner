import type { Request, Response } from "express";
import { ApiError } from "../../common/errors/api-error.js";
import { FindingsService } from "./findings.service.js";
import type { ListScanFindingsQuery } from "./findings.schemas.js";

export class FindingsController {
  constructor(private readonly service = new FindingsService()) {}

  listByScan = async (req: Request, res: Response) => {
    res.json(await this.service.listByScan(req.params.scanId!, req.query as unknown as ListScanFindingsQuery));
  };

  get = async (req: Request, res: Response) => {
    res.json(await this.service.get(req.params.findingId!, req.auth?.organizationId));
  };

  evidence = async (req: Request, res: Response) => {
    res.json(await this.service.evidence(req.params.findingId!, req.auth?.organizationId));
  };

  evidenceSummary = async (req: Request, res: Response) => {
    const organizationId = req.query.organizationId;
    if (typeof organizationId !== "string") {
      throw ApiError.validation({ fieldErrors: { organizationId: ["organizationId is required"] } });
    }
    res.json(await this.service.evidenceSummary(req.params.scanId!, organizationId));
  };
}
