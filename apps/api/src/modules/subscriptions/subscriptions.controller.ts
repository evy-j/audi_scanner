import type { Request, Response } from "express";
import { SubscriptionsService } from "./subscriptions.service.js";

export class SubscriptionsController {
  constructor(private readonly service = new SubscriptionsService()) {}

  list = async (req: Request, res: Response) => {
    res.json(await this.service.list(req.params.organizationId!));
  };

  current = async (req: Request, res: Response) => {
    res.json(await this.service.current(req.params.organizationId!));
  };

  updateCurrent = async (req: Request, res: Response) => {
    res.json(await this.service.updateCurrent(req.params.organizationId!, req.body));
  };
}
