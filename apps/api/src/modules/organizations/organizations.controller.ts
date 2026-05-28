import type { Request, Response } from "express";
import { ApiError } from "../../common/errors/api-error.js";
import { OrganizationsService } from "./organizations.service.js";

export class OrganizationsController {
  constructor(private readonly service = new OrganizationsService()) {}

  list = async (req: Request, res: Response) => {
    if (!req.auth?.userId) throw ApiError.unauthorized();
    res.json(await this.service.list(req.auth.userId));
  };

  create = async (req: Request, res: Response) => {
    if (!req.auth?.userId) throw ApiError.unauthorized();
    res.status(201).json(await this.service.create(req.auth.userId, req.body));
  };

  get = async (req: Request, res: Response) => {
    res.json(await this.service.get(req.params.organizationId!));
  };

  update = async (req: Request, res: Response) => {
    res.json(await this.service.update(req.params.organizationId!, req.body));
  };

  remove = async (req: Request, res: Response) => {
    res.json(await this.service.remove(req.params.organizationId!));
  };

  members = async (req: Request, res: Response) => {
    res.json(await this.service.members(req.params.organizationId!));
  };

  usage = async (req: Request, res: Response) => {
    res.json(await this.service.usage(req.params.organizationId!));
  };
}
