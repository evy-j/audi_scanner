import type { Request, Response } from "express";
import { VulnerabilitiesService } from "./vulnerabilities.service.js";
import type { ListVulnerabilitiesQuery } from "./vulnerabilities.schemas.js";

export class VulnerabilitiesController {
  constructor(private readonly service = new VulnerabilitiesService()) {}

  list = async (req: Request, res: Response) => {
    res.json(await this.service.list(req.query as unknown as ListVulnerabilitiesQuery));
  };

  get = async (req: Request, res: Response) => {
    res.json(await this.service.get(req.params.vulnerabilityId!, req.auth?.organizationId));
  };

  update = async (req: Request, res: Response) => {
    res.json(
      await this.service.update(req.params.vulnerabilityId!, req.body, req.auth?.organizationId)
    );
  };
}
