import { ApiError } from "../../common/errors/api-error.js";
import { ReviewRepository, type ReviewActor } from "./review.repository.js";
import type {
  BaselineComparisonQuery,
  CodeOwnerRuleBody,
  FindingAssignmentBody,
  FindingCommentBody,
  ReviewStatusBody,
  SarifExportQuery,
  SuppressFindingBody,
  SuppressionRuleBody,
  UnsuppressFindingBody
} from "./review.schemas.js";

export class ReviewService {
  constructor(private readonly repository = new ReviewRepository()) {}

  async reviewSummary(scanId: string, organizationId: string) {
    return this.mapProjectRequirement(async () => {
      const summary = await this.repository.getReviewSummary(scanId, organizationId);
      if (!summary) throw ApiError.notFound("Scan");
      return summary;
    });
  }

  async getReview(findingId: string, organizationId: string) {
    return this.mapProjectRequirement(async () => {
      const review = await this.repository.getReview(findingId, organizationId);
      return {
        findingId,
        review,
        effectiveStatus: review?.status ?? "UNREVIEWED"
      };
    });
  }

  async changeStatus(findingId: string, actor: ReviewActor, input: ReviewStatusBody) {
    return this.mapProjectRequirement(async () => {
      const review = await this.repository.changeStatus(findingId, actor, input);
      if (!review) throw ApiError.notFound("Finding");
      return review;
    });
  }

  async addComment(findingId: string, actor: ReviewActor, input: FindingCommentBody) {
    return this.mapProjectRequirement(async () => {
      const comment = await this.repository.addComment(findingId, actor, { body: input.body ?? "" });
      if (!comment) throw ApiError.notFound("Finding");
      return comment;
    });
  }

  async assign(findingId: string, actor: ReviewActor, input: FindingAssignmentBody) {
    return this.mapProjectRequirement(async () => {
      const review = await this.repository.assignFinding(findingId, actor, input);
      if (!review) throw ApiError.notFound("Finding");
      return review;
    });
  }

  async suppress(findingId: string, actor: ReviewActor, input: SuppressFindingBody) {
    return this.mapProjectRequirement(async () => {
      const review = await this.repository.suppressFinding(findingId, actor, input);
      if (!review) throw ApiError.notFound("Finding");
      return review;
    });
  }

  async unsuppress(findingId: string, actor: ReviewActor, input: UnsuppressFindingBody) {
    return this.mapProjectRequirement(async () => {
      const review = await this.repository.unsuppressFinding(findingId, actor, input);
      if (!review) throw ApiError.notFound("Finding");
      return review;
    });
  }

  async listSuppressionRules(projectId: string, organizationId: string) {
    const rules = await this.repository.listSuppressionRules(projectId, organizationId);
    if (!rules) throw ApiError.notFound("Project");
    return rules;
  }

  async createSuppressionRule(projectId: string, actor: ReviewActor, input: SuppressionRuleBody) {
    const result = await this.repository.createSuppressionRule(projectId, actor, input);
    if (!result) throw ApiError.notFound("Project");
    return result;
  }

  async deleteSuppressionRule(projectId: string, ruleId: string, organizationId: string) {
    const rule = await this.repository.deleteSuppressionRule(projectId, ruleId, organizationId);
    if (!rule) throw ApiError.notFound("Suppression rule");
    return { ok: true };
  }

  async baselineComparison(scanId: string, query: BaselineComparisonQuery) {
    return this.mapProjectRequirement(async () => {
      const comparison = await this.repository.compareBaseline(scanId, query.organizationId, query.baseScanId);
      if (!comparison) throw ApiError.notFound("Scan");
      return comparison;
    });
  }

  async listCodeOwners(projectId: string, organizationId: string) {
    const rules = await this.repository.listCodeOwnerRules(projectId, organizationId);
    if (!rules) throw ApiError.notFound("Project");
    return rules;
  }

  async createCodeOwner(projectId: string, actor: ReviewActor, input: CodeOwnerRuleBody) {
    const result = await this.repository.createCodeOwnerRule(projectId, actor, input);
    if (!result) throw ApiError.notFound("Project");
    return result;
  }

  async deleteCodeOwner(projectId: string, ruleId: string, organizationId: string) {
    const rule = await this.repository.deleteCodeOwnerRule(projectId, ruleId, organizationId);
    if (!rule) throw ApiError.notFound("Code owner rule");
    return { ok: true };
  }

  async exportSarif(scanId: string, query: SarifExportQuery) {
    return this.mapProjectRequirement(async () => {
      const sarif = await this.repository.exportSarif(
        scanId,
        query.organizationId,
        query.includeSuppressed
      );
      if (!sarif) throw ApiError.notFound("Scan");
      return sarif;
    });
  }

  private async mapProjectRequirement<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Error && error.message === "Scan is not associated with a project") {
        throw ApiError.badRequest("Scan is not associated with a project");
      }
      throw error;
    }
  }
}
