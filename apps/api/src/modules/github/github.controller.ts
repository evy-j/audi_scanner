import type { Request, Response } from "express";
import { ApiError } from "../../common/errors/api-error.js";
import { GitHubIntegrationService } from "./github.service.js";
import { SourceIngestionService } from "../source-ingestion/source-ingestion.service.js";

export class GitHubIntegrationController {
  constructor(
    private readonly service = new GitHubIntegrationService(),
    private readonly sourceIngestion = new SourceIngestionService()
  ) {}

  status = async (req: Request, res: Response) => {
    res.json(await this.service.status(actor(req)));
  };

  installations = async (req: Request, res: Response) => {
    res.json(await this.service.listInstallations(req.params.orgId!));
  };

  connectInstallation = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.connectInstallation(req.params.orgId!, actor(req), req.body));
  };

  repositories = async (req: Request, res: Response) => {
    res.json(await this.service.listRepositories(req.params.orgId!));
  };

  connectRepository = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.connectRepository(req.params.orgId!, actor(req), req.body));
  };

  scanRepository = async (req: Request, res: Response) => {
    res.status(202).json(await this.sourceIngestion.scanRepository(req.params.repoId!, actor(req), {
      ...req.body,
      organizationId: req.params.orgId
    }));
  };

  repositoryScans = async (req: Request, res: Response) => {
    res.json(await this.service.listRepositoryScans(req.params.orgId!, req.params.repoId!, actor(req)));
  };

  webhook = async (req: Request, res: Response) => {
    if (!req.rawBody) throw ApiError.badRequest("Raw webhook body is required");
    const deliveryId = req.header("x-github-delivery");
    const eventName = req.header("x-github-event");
    if (!deliveryId || !eventName) throw ApiError.badRequest("GitHub webhook headers are required");
    res.json(await this.service.handleWebhook({
      rawBody: req.rawBody,
      signature: req.header("x-hub-signature-256") ?? undefined,
      deliveryId,
      eventName,
      payload: req.body
    }));
  };
}

function actor(req: Request) {
  return {
    organizationId: String(req.params.orgId ?? req.query.organizationId ?? req.auth?.organizationId),
    actorUserId: req.auth?.userId,
    apiKeyId: req.auth?.type === "apiKey" ? req.auth.apiKeyId : undefined,
    githubRepositoryId: req.auth?.type === "apiKey" ? req.auth.githubRepositoryId : undefined,
    projectId: req.auth?.type === "apiKey" ? req.auth.projectId : undefined,
    permissions: [...(req.auth?.permissions ?? []), ...(req.auth?.scopes ?? [])]
  };
}
