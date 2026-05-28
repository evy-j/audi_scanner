import type { Request, Response } from "express";
import { ReportsService } from "./reports.service.js";
import type { ListReportsQuery } from "./reports.schemas.js";

export class ReportsController {
  constructor(private readonly service = new ReportsService()) {}

  list = async (req: Request, res: Response) => {
    res.json(await this.service.list(req.query as unknown as ListReportsQuery));
  };

  get = async (req: Request, res: Response) => {
    res.json(await this.service.get(req.params.reportId!, req.auth?.organizationId));
  };

  pdf = async (req: Request, res: Response) => {
    res.json(
      await this.service.export(req.params.reportId!, actor(req), {
        format: "PDF",
        includeSuppressed: false
      })
    );
  };

  listByScan = async (req: Request, res: Response) => {
    res.json(await this.service.listByScan(req.params.scanId!, String(req.query.organizationId)));
  };

  generate = async (req: Request, res: Response) => {
    res.status(202).json(await this.service.generate(req.params.scanId!, actor(req)));
  };

  export = async (req: Request, res: Response) => {
    res.status(202).json(await this.service.export(req.params.reportId!, actor(req), req.body));
  };

  share = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.share(req.params.reportId!, actor(req), req.body));
  };

  revokeShare = async (req: Request, res: Response) => {
    res.json(await this.service.revokeShare(req.params.reportId!, actor(req)));
  };

  publicReport = async (req: Request, res: Response) => {
    res.json(await this.service.publicReport(req.params.shareToken!));
  };
}

function actor(req: Request) {
  return {
    organizationId: String(req.query.organizationId ?? req.auth?.organizationId),
    actorUserId: req.auth?.userId
  };
}
