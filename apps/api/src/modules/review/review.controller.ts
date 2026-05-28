import type { Request, Response } from "express";
import { ReviewService } from "./review.service.js";
import type {
  BaselineComparisonQuery,
  SarifExportQuery
} from "./review.schemas.js";

export class ReviewController {
  constructor(private readonly service = new ReviewService()) {}

  reviewSummary = async (req: Request, res: Response) => {
    res.json(await this.service.reviewSummary(req.params.scanId!, String(req.query.organizationId)));
  };

  getReview = async (req: Request, res: Response) => {
    res.json(await this.service.getReview(req.params.findingId!, String(req.query.organizationId)));
  };

  changeStatus = async (req: Request, res: Response) => {
    res.json(
      await this.service.changeStatus(req.params.findingId!, actor(req), req.body)
    );
  };

  addComment = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.addComment(req.params.findingId!, actor(req), req.body));
  };

  assign = async (req: Request, res: Response) => {
    res.json(await this.service.assign(req.params.findingId!, actor(req), req.body));
  };

  suppress = async (req: Request, res: Response) => {
    res.json(await this.service.suppress(req.params.findingId!, actor(req), req.body));
  };

  unsuppress = async (req: Request, res: Response) => {
    res.json(await this.service.unsuppress(req.params.findingId!, actor(req), req.body));
  };

  listSuppressionRules = async (req: Request, res: Response) => {
    res.json(await this.service.listSuppressionRules(req.params.projectId!, String(req.query.organizationId)));
  };

  createSuppressionRule = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.createSuppressionRule(req.params.projectId!, actor(req), req.body));
  };

  deleteSuppressionRule = async (req: Request, res: Response) => {
    res.json(
      await this.service.deleteSuppressionRule(
        req.params.projectId!,
        req.params.ruleId!,
        String(req.query.organizationId)
      )
    );
  };

  baselineComparison = async (req: Request, res: Response) => {
    res.json(
      await this.service.baselineComparison(
        req.params.scanId!,
        req.query as unknown as BaselineComparisonQuery
      )
    );
  };

  listCodeOwners = async (req: Request, res: Response) => {
    res.json(await this.service.listCodeOwners(req.params.projectId!, String(req.query.organizationId)));
  };

  createCodeOwner = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.createCodeOwner(req.params.projectId!, actor(req), req.body));
  };

  deleteCodeOwner = async (req: Request, res: Response) => {
    res.json(
      await this.service.deleteCodeOwner(
        req.params.projectId!,
        req.params.ruleId!,
        String(req.query.organizationId)
      )
    );
  };

  exportSarif = async (req: Request, res: Response) => {
    res.json(await this.service.exportSarif(req.params.scanId!, req.query as unknown as SarifExportQuery));
  };
}

function actor(req: Request) {
  return {
    organizationId: String(req.query.organizationId),
    actorUserId: req.auth?.userId
  };
}
