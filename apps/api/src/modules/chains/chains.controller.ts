import type { Request, Response } from "express";
import { ChainsService } from "./chains.service.js";

const service = new ChainsService();

export class ChainsController {
  list = async (req: Request, res: Response) => {
    res.json(await service.listChains(req.query as any));
  };

  get = async (req: Request, res: Response) => {
    res.json(await service.getChain(req.params.chainId!));
  };

  explorers = async (req: Request, res: Response) => {
    res.json(await service.listExplorers(req.params.chainId!));
  };

  features = async (req: Request, res: Response) => {
    res.json(await service.listFeatures(req.params.chainId!));
  };

  rpcEndpoints = async (req: Request, res: Response) => {
    res.json(await service.listRpcEndpoints(req.params.chainId!, req.query.organizationId as string | undefined, req.query.projectId as string | undefined));
  };

  createRpcEndpoint = async (req: Request, res: Response) => {
    res.json(await service.createRpcEndpoint({
      chainId: req.params.chainId!,
      organizationId: req.params.orgId!,
      actorUserId: req.auth?.userId,
      apiKeyId: req.auth?.type === "apiKey" ? req.auth.apiKeyId : undefined,
      requestId: req.id,
      ...req.body
    }));
  };

  validateAddress = async (req: Request, res: Response) => {
    res.json(await service.validateAddress(req.params.chainId!, String(req.query.address ?? "")));
  };
}
