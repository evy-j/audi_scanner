import type { Request, Response } from "express";
import { ApiError } from "../../common/errors/api-error.js";
import { ScansService } from "./scans.service.js";
import type { ListScansQuery } from "./scans.schemas.js";

export class ScansController {
  constructor(private readonly service = new ScansService()) {}

  create = async (req: Request, res: Response) => {
    if (!req.auth?.userId) throw ApiError.unauthorized();
    const scan = await this.service.create(req.body, req.auth.userId, {
      traceId: req.traceId,
      correlationId: req.correlationId
    });
    res.status(202).json({
      ...scan,
      traceId: req.traceId,
      correlationId: req.correlationId
    });
  };

  list = async (req: Request, res: Response) => {
    res.json(await this.service.list(req.query as unknown as ListScansQuery));
  };

  get = async (req: Request, res: Response) => {
    res.json(await this.service.get(req.params.scanId!, req.auth?.organizationId));
  };

  cancel = async (req: Request, res: Response) => {
    res.json(await this.service.cancel(req.params.scanId!, req.auth?.organizationId, req.auth?.userId));
  };
}
