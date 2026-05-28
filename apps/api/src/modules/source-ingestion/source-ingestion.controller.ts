import type { Request, Response } from "express";
import { SourceIngestionService } from "./source-ingestion.service.js";

export class SourceIngestionController {
  constructor(private readonly service = new SourceIngestionService()) {}

  upload = async (req: Request, res: Response) => {
    res.status(req.body?.dryRun ? 200 : 201).json(await this.service.uploadSourceArtifact(actor(req), req.body));
  };

  artifact = async (req: Request, res: Response) => {
    res.json(await this.service.getArtifact(req.params.artifactId!, actor(req)));
  };

  manifest = async (req: Request, res: Response) => {
    res.json(await this.service.getManifest(req.params.artifactId!, actor(req)));
  };

  ingestRepository = async (req: Request, res: Response) => {
    res.status(202).json(await this.service.ingestRepository(req.params.repositoryId!, actor(req), req.body));
  };

  scanRepository = async (req: Request, res: Response) => {
    res.status(202).json(await this.service.scanRepository(req.params.repositoryId!, actor(req), req.body));
  };

  scanPullRequest = async (req: Request, res: Response) => {
    res.status(202).json(await this.service.scanPullRequest(req.params.pullRequestId!, actor(req), req.body));
  };

  run = async (req: Request, res: Response) => {
    res.json(await this.service.getRun(req.params.runId!, actor(req)));
  };
}

function actor(req: Request) {
  return {
    organizationId: req.auth?.organizationId ?? String(req.body?.organizationId ?? req.query?.organizationId ?? ""),
    actorUserId: req.auth?.userId,
    apiKeyId: req.auth?.type === "apiKey" ? req.auth.apiKeyId : undefined,
    projectId: req.auth?.type === "apiKey" ? req.auth.projectId : undefined,
    githubRepositoryId: req.auth?.type === "apiKey" ? req.auth.githubRepositoryId : undefined,
    permissions: [...(req.auth?.permissions ?? []), ...(req.auth?.scopes ?? [])]
  };
}
