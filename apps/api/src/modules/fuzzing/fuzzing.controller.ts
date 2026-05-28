import type { Request, Response } from "express";
import { FuzzingService } from "./fuzzing.service.js";

export class FuzzingController {
  constructor(private readonly service = new FuzzingService()) {}

  scanSummary = async (req: Request, res: Response) => {
    res.json(await this.service.scanSummary(req.params.scanId!, String(req.query.organizationId)));
  };

  fuzzScan = async (req: Request, res: Response) => {
    res.status(202).json(await this.service.fuzzScan(req.params.scanId!, actor(req)));
  };

  findingFuzz = async (req: Request, res: Response) => {
    res.json(await this.service.findingFuzz(req.params.findingId!, String(req.query.organizationId)));
  };

  fuzzFinding = async (req: Request, res: Response) => {
    res.status(202).json(await this.service.fuzzFinding(req.params.findingId!, actor(req)));
  };

  get = async (req: Request, res: Response) => {
    res.json(await this.service.get(req.params.fuzzRunId!, String(req.query.organizationId)));
  };

  artifacts = async (req: Request, res: Response) => {
    res.json(await this.service.artifacts(req.params.fuzzRunId!, String(req.query.organizationId)));
  };

  scanInvariants = async (req: Request, res: Response) => {
    res.json(await this.service.scanInvariants(req.params.scanId!, String(req.query.organizationId)));
  };

  runScanInvariants = async (req: Request, res: Response) => {
    res.status(202).json(await this.service.runScanInvariants(req.params.scanId!, actor(req)));
  };
}

function actor(req: Request) {
  return {
    organizationId: String(req.query.organizationId),
    actorUserId: req.auth?.userId
  };
}
