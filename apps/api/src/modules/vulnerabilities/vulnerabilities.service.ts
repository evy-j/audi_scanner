import { ApiError } from "../../common/errors/api-error.js";
import { VulnerabilitiesRepository } from "./vulnerabilities.repository.js";
import type {
  ListVulnerabilitiesQuery,
  UpdateVulnerabilityInput
} from "./vulnerabilities.schemas.js";

export class VulnerabilitiesService {
  constructor(private readonly repository = new VulnerabilitiesRepository()) {}

  list(query: ListVulnerabilitiesQuery) {
    return this.repository.list(query);
  }

  async get(id: string, organizationId?: string | undefined) {
    const vulnerability = await this.repository.findById(id);
    if (!vulnerability || (organizationId && vulnerability.scan.organizationId !== organizationId)) {
      throw ApiError.notFound("Vulnerability");
    }

    return vulnerability;
  }

  async update(id: string, input: UpdateVulnerabilityInput, organizationId?: string | undefined) {
    await this.get(id, organizationId);
    return this.repository.update(id, input);
  }
}
