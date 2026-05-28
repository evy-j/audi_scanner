import { ApiError } from "../../common/errors/api-error.js";
import { FindingsRepository } from "./findings.repository.js";
import type { ListScanFindingsQuery } from "./findings.schemas.js";

export class FindingsService {
  constructor(private readonly repository = new FindingsRepository()) {}

  async listByScan(scanId: string, query: ListScanFindingsQuery) {
    const findings = await this.repository.listByScan(scanId, query);
    if (!findings) {
      throw ApiError.notFound("Scan");
    }

    return findings;
  }

  async get(findingId: string, organizationId?: string | undefined) {
    const finding = await this.repository.findById(findingId);
    if (!finding || (organizationId && finding.scan.organizationId !== organizationId)) {
      throw ApiError.notFound("Finding");
    }

    return finding;
  }

  async evidence(findingId: string, organizationId?: string | undefined) {
    const evidence = await this.repository.listEvidence(findingId, organizationId);
    if (!evidence) {
      throw ApiError.notFound("Finding");
    }

    return evidence;
  }

  async evidenceSummary(scanId: string, organizationId: string) {
    const summary = await this.repository.evidenceSummary(scanId, organizationId);
    if (!summary) {
      throw ApiError.notFound("Scan");
    }

    return summary;
  }
}
