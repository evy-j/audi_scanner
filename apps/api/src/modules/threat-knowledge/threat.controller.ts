import type { Request, Response } from "express";
import { ThreatKnowledgeService } from "./threat.service.js";

export class ThreatKnowledgeController {
  constructor(private readonly service = new ThreatKnowledgeService()) {}

  listThreatIntel = async (req: Request, res: Response) => {
    res.json(await this.service.listThreatIntel(String(req.query.organizationId), {
      projectId: req.query.projectId as string | undefined,
      scanId: req.query.scanId as string | undefined,
      findingId: req.query.findingId as string | undefined,
      sourceType: req.query.sourceType as never,
      confidence: req.query.confidence as never,
      limit: Number(req.query.limit ?? 50)
    }));
  };

  createThreatIntel = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.createThreatIntel(actor(req), req.body));
  };

  importThreatIntel = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.importThreatIntel(actor(req), req.body));
  };

  listThreatSignatures = async (req: Request, res: Response) => {
    res.json(await this.service.listThreatSignatures(String(req.query.organizationId), {
      projectId: req.query.projectId as string | undefined,
      kind: req.query.kind as never,
      limit: Number(req.query.limit ?? 50)
    }));
  };

  createThreatSignature = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.createThreatSignature(actor(req), req.body));
  };

  getThreatSignature = async (req: Request, res: Response) => {
    res.json(await this.service.getThreatSignature(req.params.signatureId!, String(req.query.organizationId)));
  };

  matchSignatureToScan = async (req: Request, res: Response) => {
    res.status(202).json(await this.service.matchSignatureToScan(req.params.signatureId!, req.params.scanId!, actor(req)));
  };

  listScanMatches = async (req: Request, res: Response) => {
    res.json(await this.service.listScanMatches(req.params.scanId!, String(req.query.organizationId)));
  };

  listFindingMatches = async (req: Request, res: Response) => {
    res.json(await this.service.listFindingMatches(req.params.findingId!, String(req.query.organizationId)));
  };

  listDetectorPrecision = async (req: Request, res: Response) => {
    res.json(await this.service.listDetectorPrecision(String(req.query.organizationId), {
      projectId: req.query.projectId as string | undefined,
      scanId: req.query.scanId as string | undefined,
      analyzer: req.query.analyzer as string | undefined,
      ruleId: req.query.ruleId as string | undefined,
      limit: Number(req.query.limit ?? 50)
    }));
  };

  addFalsePositiveFeedback = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.addFalsePositiveFeedback(req.params.findingId!, actor(req), req.body));
  };

  listFalsePositiveFeedback = async (req: Request, res: Response) => {
    res.json(await this.service.listFalsePositiveFeedback(req.params.findingId!, String(req.query.organizationId)));
  };

  scanThreatSummary = async (req: Request, res: Response) => {
    res.json(await this.service.scanThreatSummary(req.params.scanId!, String(req.query.organizationId)));
  };
}

function actor(req: Request) {
  return {
    organizationId: String(req.query.organizationId),
    actorUserId: req.auth?.userId
  };
}
