import type { Request, Response } from "express";
import { MonitoringService } from "./monitoring.service.js";

export class MonitoringController {
  constructor(private readonly service = new MonitoringService()) {}

  listTargets = async (req: Request, res: Response) => {
    res.json(await this.service.listTargets(req.params.projectId!, String(req.query.organizationId)));
  };

  createTarget = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.createTarget(req.params.projectId!, actor(req), req.body));
  };

  updateTarget = async (req: Request, res: Response) => {
    res.json(await this.service.updateTarget(req.params.targetId!, actor(req), req.body));
  };

  deleteTarget = async (req: Request, res: Response) => {
    res.json(await this.service.deleteTarget(req.params.targetId!, actor(req)));
  };

  listAlerts = async (req: Request, res: Response) => {
    res.json(await this.service.listAlerts(req.params.projectId!, String(req.query.organizationId), {
      status: req.query.status as never,
      limit: Number(req.query.limit ?? 50)
    }));
  };

  getAlert = async (req: Request, res: Response) => {
    res.json(await this.service.getAlert(req.params.alertId!, String(req.query.organizationId)));
  };

  acknowledgeAlert = async (req: Request, res: Response) => {
    res.json(await this.service.transitionAlert(req.params.alertId!, actor(req), "ACKNOWLEDGED", req.body.reason));
  };

  resolveAlert = async (req: Request, res: Response) => {
    res.json(await this.service.transitionAlert(req.params.alertId!, actor(req), "RESOLVED", req.body.reason));
  };

  dismissAlert = async (req: Request, res: Response) => {
    res.json(await this.service.transitionAlert(req.params.alertId!, actor(req), "DISMISSED", req.body.reason));
  };

  addComment = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.addComment(req.params.alertId!, actor(req), req.body.body));
  };

  scanSummary = async (req: Request, res: Response) => {
    res.json(await this.service.scanSummary(req.params.scanId!, String(req.query.organizationId)));
  };

  runOnce = async (req: Request, res: Response) => {
    res.status(202).json(await this.service.runOnce(req.params.projectId!, actor(req)));
  };

  listWebhooks = async (req: Request, res: Response) => {
    res.json(await this.service.listWebhooks(req.params.projectId!, String(req.query.organizationId)));
  };

  createWebhook = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.createWebhook(req.params.projectId!, actor(req), req.body));
  };

  deleteWebhook = async (req: Request, res: Response) => {
    res.json(await this.service.deleteWebhook(req.params.projectId!, req.params.webhookId!, actor(req)));
  };
}

function actor(req: Request) {
  return {
    organizationId: String(req.query.organizationId),
    actorUserId: req.auth?.userId
  };
}
