import type { Request, Response } from "express";
import { EnterpriseService } from "./enterprise.service.js";

export class EnterpriseController {
  constructor(private readonly service = new EnterpriseService()) {}

  members = async (req: Request, res: Response) => {
    res.json(await this.service.members(req.params.orgId!));
  };

  inviteMember = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.inviteMember(req.params.orgId!, actor(req), req.body));
  };

  updateMember = async (req: Request, res: Response) => {
    res.json(await this.service.updateMember(req.params.orgId!, req.params.memberId!, actor(req), req.body));
  };

  removeMember = async (req: Request, res: Response) => {
    res.json(await this.service.removeMember(req.params.orgId!, req.params.memberId!, actor(req)));
  };

  projectMembers = async (req: Request, res: Response) => {
    res.json(await this.service.listProjectMembers(req.params.projectId!, String(req.query.organizationId ?? req.auth?.organizationId)));
  };

  addProjectMember = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.addProjectMember(req.params.projectId!, actor(req), req.body));
  };

  updateProjectMember = async (req: Request, res: Response) => {
    res.json(await this.service.updateProjectMember(req.params.projectId!, req.params.memberId!, actor(req), req.body));
  };

  removeProjectMember = async (req: Request, res: Response) => {
    res.json(await this.service.removeProjectMember(req.params.projectId!, req.params.memberId!, actor(req)));
  };

  auditLogs = async (req: Request, res: Response) => {
    res.json(await this.service.auditLogs(req.params.orgId!, Number(req.query.limit ?? 50)));
  };

  getSso = async (req: Request, res: Response) => {
    res.json(await this.service.getSso(req.params.orgId!));
  };

  upsertSso = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.upsertSso(req.params.orgId!, actor(req), req.body));
  };

  patchSso = async (req: Request, res: Response) => {
    res.json(await this.service.upsertSso(req.params.orgId!, actor(req), req.body));
  };

  deleteSso = async (req: Request, res: Response) => {
    res.json(await this.service.deleteSso(req.params.orgId!, actor(req)));
  };

  getRetention = async (req: Request, res: Response) => {
    res.json(await this.service.getRetention(req.params.orgId!));
  };

  updateRetention = async (req: Request, res: Response) => {
    res.json(await this.service.updateRetention(req.params.orgId!, actor(req), req.body));
  };

  createExportRequest = async (req: Request, res: Response) => {
    res.status(202).json(await this.service.createExportRequest(req.params.orgId!, actor(req), req.body));
  };

  createDeletionRequest = async (req: Request, res: Response) => {
    res.status(202).json(await this.service.createDeletionRequest(req.params.orgId!, actor(req), req.body));
  };

  getSecuritySettings = async (req: Request, res: Response) => {
    res.json(await this.service.getSecuritySettings(req.params.orgId!));
  };

  updateSecuritySettings = async (req: Request, res: Response) => {
    res.json(await this.service.updateSecuritySettings(req.params.orgId!, actor(req), req.body));
  };
}

function actor(req: Request) {
  return {
    organizationId: String(req.params.orgId ?? req.query.organizationId ?? req.auth?.organizationId),
    actorUserId: req.auth?.userId
  };
}
