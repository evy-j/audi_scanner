import type { Request, Response } from "express";
import { ApiError } from "../../common/errors/api-error.js";
import { BuildsService } from "./builds.service.js";

export class BuildsController {
  constructor(private readonly service = new BuildsService()) {}

  buildProfile = async (req: Request, res: Response) => {
    res.json(await this.service.buildProfile(req.params.scanId!, requireOrganizationId(req)));
  };

  buildRuns = async (req: Request, res: Response) => {
    res.json(await this.service.buildRuns(req.params.scanId!, requireOrganizationId(req)));
  };

  compilerArtifacts = async (req: Request, res: Response) => {
    res.json(await this.service.compilerArtifacts(req.params.scanId!, requireOrganizationId(req)));
  };

  testRuns = async (req: Request, res: Response) => {
    res.json(await this.service.testRuns(req.params.scanId!, requireOrganizationId(req)));
  };

  toolAvailability = async (req: Request, res: Response) => {
    res.json(await this.service.toolAvailability(req.params.scanId!, requireOrganizationId(req)));
  };

  retryBuild = async (req: Request, res: Response) => {
    res.status(202).json(
      await this.service.retryBuild(req.params.scanId!, requireOrganizationId(req), req.auth?.userId)
    );
  };

  retryAnalyzers = async (req: Request, res: Response) => {
    res.status(202).json(
      await this.service.retryAnalyzers(req.params.scanId!, requireOrganizationId(req), req.body, req.auth?.userId)
    );
  };
}

function requireOrganizationId(req: Request): string {
  const organizationId = req.query.organizationId;
  if (typeof organizationId !== "string") {
    throw ApiError.validation({ fieldErrors: { organizationId: ["organizationId is required"] } });
  }
  return organizationId;
}
