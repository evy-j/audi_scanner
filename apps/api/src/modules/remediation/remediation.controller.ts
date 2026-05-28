import type { Request, Response } from "express";
import { RemediationService } from "./remediation.service.js";

export class RemediationController {
  constructor(private readonly service = new RemediationService()) {}

  findingRemediation = async (req: Request, res: Response) => {
    res.json(await this.service.findingRemediation(req.params.findingId!, String(req.query.organizationId)));
  };

  remediateFinding = async (req: Request, res: Response) => {
    res.status(202).json(await this.service.remediateFinding(req.params.findingId!, actor(req)));
  };

  scanSummary = async (req: Request, res: Response) => {
    res.json(await this.service.scanSummary(req.params.scanId!, String(req.query.organizationId)));
  };

  review = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.review(req.params.remediationId!, actor(req), req.body));
  };

  markReviewed = async (req: Request, res: Response) => {
    res.json(await this.service.markReviewed(req.params.remediationId!, actor(req), req.body));
  };

  reject = async (req: Request, res: Response) => {
    res.json(await this.service.reject(req.params.remediationId!, actor(req), req.body));
  };
}

function actor(req: Request) {
  return {
    organizationId: String(req.query.organizationId),
    actorUserId: req.auth?.userId
  };
}
