import { ApiError } from "../../common/errors/api-error.js";
import { AnalysisIrRepository } from "./analysis-ir.repository.js";

export class AnalysisIrService {
  constructor(private readonly repository = new AnalysisIrRepository()) {}

  async summary(scanId: string, organizationId: string) {
    const result = await this.repository.summary(scanId, organizationId);
    if (!result) throw ApiError.notFound("Scan");
    return result;
  }

  async contracts(scanId: string, organizationId: string) {
    const result = await this.repository.contracts(scanId, organizationId);
    if (!result) throw ApiError.notFound("Scan");
    return result;
  }

  async functions(scanId: string, contractId: string, organizationId: string) {
    const result = await this.repository.functions(scanId, contractId, organizationId);
    if (!result) throw ApiError.notFound("Contract");
    return result;
  }

  async callGraph(scanId: string, organizationId: string) {
    const result = await this.repository.callGraph(scanId, organizationId);
    if (!result) throw ApiError.notFound("Scan");
    return result;
  }

  async externalCalls(scanId: string, organizationId: string) {
    const result = await this.repository.externalCalls(scanId, organizationId);
    if (!result) throw ApiError.notFound("Scan");
    return result;
  }

  async storageLayout(scanId: string, organizationId: string) {
    const result = await this.repository.storageLayout(scanId, organizationId);
    if (!result) throw ApiError.notFound("Scan");
    return result;
  }

  async findingCodeLinks(findingId: string, organizationId: string) {
    const result = await this.repository.findingCodeLinks(findingId, organizationId);
    if (!result) throw ApiError.notFound("Finding");
    return result;
  }
}
