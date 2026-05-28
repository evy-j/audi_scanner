
import type { Request, Response } from "express";
import { SecurityOsService } from "./security-os.service.js";

const service = new SecurityOsService();

export class SecurityOsController {
  list = async (_req: Request, res: Response) => {
    res.json(service.list());
  };

  get = async (req: Request, res: Response) => {
    const result = service.get(req.params.phaseId ?? "");
    if (!result.phase) {
      res.status(404).json(result);
      return;
    }
    res.json(result);
  };

  listDeepPhases = async (_req: Request, res: Response) => {
    res.json(service.listDeepPhases());
  };

  getDeepPhase = async (req: Request, res: Response) => {
    const result = service.getDeepPhase(req.params.phaseId ?? "");
    if (!result.phase) {
      res.status(404).json(result);
      return;
    }
    res.json(result);
  };

  deepSummary = async (req: Request, res: Response) => {
    res.json(await service.summary(req.query as any));
  };

  listArtifacts = async (req: Request, res: Response) => {
    res.json(await service.listArtifacts(req.query as any));
  };

  getArtifact = async (req: Request, res: Response) => {
    const result = await service.getArtifact(req.params.artifactId!, req.auth?.organizationId);
    if (!result.artifact) {
      res.status(404).json(result);
      return;
    }
    res.json(result);
  };

  createArtifact = async (req: Request, res: Response) => {
    const result = await service.createArtifact({ ...req.body, createdByUserId: req.auth?.userId });
    res.status(201).json(result);
  };

  updateArtifactStatus = async (req: Request, res: Response) => {
    const result = await service.updateArtifactStatus({
      artifactId: req.params.artifactId!,
      status: String(req.body?.status ?? ""),
      reason: req.body?.reason,
      metadata: req.body?.metadata,
      actorUserId: req.auth?.userId,
      organizationId: req.auth?.organizationId
    });
    if (!result.artifact) {
      res.status(404).json(result);
      return;
    }
    res.json(result);
  };

  createPhaseDefaults = async (req: Request, res: Response) => {
    res.status(201).json(await service.createPhaseDefaults({
      phase: req.params.phaseId!,
      organizationId: req.body?.organizationId ?? req.auth?.organizationId,
      projectId: req.body?.projectId,
      actorUserId: req.auth?.userId
    }));
  };


listRealTrustOperations = async (_req: Request, res: Response) => {
  res.json(service.listRealTrustOperations());
};

getRealTrustOperation = async (req: Request, res: Response) => {
  const result = service.getRealTrustOperation(req.params.operationKey ?? "");
  if (!result.template) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
};

createRealTrustOperationDefault = async (req: Request, res: Response) => {
  const result = await service.createRealTrustOperationDefault({
    key: req.params.operationKey!,
    organizationId: req.body?.organizationId ?? req.auth?.organizationId,
    projectId: req.body?.projectId,
    actorUserId: req.auth?.userId
  });
  if (!result.artifact) {
    res.status(404).json(result);
    return;
  }
  res.status(201).json(result);
};

  listAudit = async (req: Request, res: Response) => {
    res.json(await service.listAudit(req.query as any));
  };

  listTyped(phase: string, artifactType: string) {
    return async (req: Request, res: Response) => {
      res.json(await service.listArtifacts({ ...(req.query as any), phase, artifactType }));
    };
  }

  createTyped(phase: string, artifactType: string) {
    return async (req: Request, res: Response) => {
      res.status(201).json(await service.createArtifact({
        ...req.body,
        phase,
        artifactType,
        createdByUserId: req.auth?.userId,
        organizationId: req.body?.organizationId ?? req.auth?.organizationId
      }));
    };
  }
}
