import type { Request, Response } from "express";
import { SimulationService } from "./simulation.service.js";

export class SimulationController {
  constructor(private readonly service = new SimulationService()) {}

  findingSimulations = async (req: Request, res: Response) => {
    res.json(await this.service.findingSimulations(req.params.findingId!, String(req.query.organizationId)));
  };

  simulateFinding = async (req: Request, res: Response) => {
    res.status(202).json(await this.service.simulateFinding(req.params.findingId!, actor(req)));
  };

  get = async (req: Request, res: Response) => {
    res.json(await this.service.get(req.params.simulationId!, String(req.query.organizationId)));
  };

  artifacts = async (req: Request, res: Response) => {
    res.json(await this.service.artifacts(req.params.simulationId!, String(req.query.organizationId)));
  };

  scanSummary = async (req: Request, res: Response) => {
    res.json(await this.service.scanSummary(req.params.scanId!, String(req.query.organizationId)));
  };
}

function actor(req: Request) {
  return {
    organizationId: String(req.query.organizationId),
    actorUserId: req.auth?.userId
  };
}
