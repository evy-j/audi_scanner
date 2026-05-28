import type { Request, Response } from "express";
import { ApiKeysService } from "./api-keys.service.js";

export class ApiKeysController {
  constructor(private readonly service = new ApiKeysService()) {}

  list = async (req: Request, res: Response) => {
    res.json(await this.service.list(req.params.organizationId!));
  };

  create = async (req: Request, res: Response) => {
    res.status(201).json(
      await this.service.create(req.params.organizationId!, req.body, req.auth?.userId)
    );
  };

  revoke = async (req: Request, res: Response) => {
    res.json(await this.service.revoke(req.params.organizationId!, req.params.apiKeyId!));
  };
}
