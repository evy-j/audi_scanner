import type { Request, Response } from "express";
import { SimpleScansService } from "./simple-scans.service.js";

export class SimpleScansController {
  constructor(private readonly service = new SimpleScansService()) {}

  sourceUpload = async (req: Request, res: Response) => {
    res.status(202).json(await this.service.sourceUploadScan(actor(req), req.body));
  };

  publicRepository = async (req: Request, res: Response) => {
    res.status(202).json(await this.service.publicRepositoryScan(actor(req), req.body));
  };

  websitePassive = async (req: Request, res: Response) => {
    res.json(await this.service.passiveWebsiteScan(req.body));
  };
}

function actor(req: Request) {
  return {
    organizationId: req.auth?.organizationId ?? String(req.body?.organizationId ?? ""),
    actorUserId: req.auth?.userId,
    apiKeyId: req.auth?.type === "apiKey" ? req.auth.apiKeyId : undefined,
    projectId: req.auth?.type === "apiKey" ? req.auth.projectId : undefined,
    githubRepositoryId: req.auth?.type === "apiKey" ? req.auth.githubRepositoryId : undefined,
    permissions: [...(req.auth?.permissions ?? []), ...(req.auth?.scopes ?? [])]
  };
}
