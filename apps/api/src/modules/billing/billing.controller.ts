import type { Request, Response } from "express";
import { BillingService } from "./billing.service.js";

const service = new BillingService();

export class BillingController {
  status = async (_req: Request, res: Response) => {
    res.json(service.status());
  };

  plans = async (_req: Request, res: Response) => {
    res.json({ plans: await service.listPlans(), billing: service.status() });
  };

  subscription = async (req: Request, res: Response) => {
    res.json(await service.subscription(req.params.organizationId!));
  };

  usage = async (req: Request, res: Response) => {
    res.json(await service.usageSummary(req.params.organizationId!));
  };

  checkout = async (req: Request, res: Response) => {
    res.json(await service.checkout(req.params.organizationId!, actor(req), req.body));
  };

  cancel = async (req: Request, res: Response) => {
    res.json(await service.cancel(req.params.organizationId!, actor(req)));
  };

  invoices = async (req: Request, res: Response) => {
    res.json({ invoices: await service.invoices(req.params.organizationId!) });
  };

  payments = async (req: Request, res: Response) => {
    res.json({ payments: await service.payments(req.params.organizationId!) });
  };

  createAdminOverride = async (req: Request, res: Response) => {
    res.json(await service.createAdminOverride(req.params.organizationId!, actor(req), req.body));
  };

  revokeAdminOverride = async (req: Request, res: Response) => {
    res.json(await service.revokeAdminOverride(req.params.organizationId!, req.params.overrideId!, actor(req)));
  };

  webhook = async (req: Request, res: Response) => {
    const provider = providerName(req.params.provider!);
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    res.json(await service.handleWebhook(provider, rawBody, req.headers));
  };
}

function actor(req: Request) {
  return {
    actorUserId: req.auth?.userId,
    apiKeyId: req.auth?.type === "apiKey" ? req.auth.apiKeyId : undefined
  };
}

function providerName(value: string) {
  return value.toUpperCase() as "DISABLED" | "RAZORPAY" | "STRIPE" | "MANUAL";
}
