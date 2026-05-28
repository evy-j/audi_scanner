import type { Request, Response } from "express";
import { ApiError } from "../../common/errors/api-error.js";
import { ChainExplorerService } from "./explorer.service.js";

const service = new ChainExplorerService();

export class ChainExplorerController {
  verification = async (req: Request, res: Response) => {
    res.json(await service.getVerification(req.params.chainId!, req.params.address!, req.query.organizationId as string | undefined, req.query.projectId as string | undefined));
  };

  fetchSource = async (req: Request, res: Response) => {
    if (!req.auth?.userId && req.auth?.type !== "apiKey") throw ApiError.unauthorized();
    res.status(202).json(await service.fetchVerifiedSource(req.params.chainId!, req.params.address!, req.body, {
      ...(req.auth?.userId ? { userId: req.auth.userId } : {}),
      ...(req.auth?.type === "apiKey" ? { apiKeyId: req.auth.apiKeyId } : {}),
      ...(req.auth?.permissions ? { permissions: req.auth.permissions } : {}),
      ...(req.id ? { requestId: req.id } : {})
    }));
  };

  scan = async (req: Request, res: Response) => {
    if (!req.auth?.userId) throw ApiError.unauthorized();
    res.status(202).json(await service.scanVerifiedContract(req.params.chainId!, req.params.address!, req.body, {
      userId: req.auth.userId,
      ...(req.auth.type === "apiKey" ? { apiKeyId: req.auth.apiKeyId } : {}),
      ...(req.auth.permissions ? { permissions: req.auth.permissions } : {}),
      ...(req.id ? { requestId: req.id } : {})
    }));
  };
}
