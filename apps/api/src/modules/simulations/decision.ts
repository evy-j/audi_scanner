import type { SimulationStatus } from "@prisma/client";

export interface SimulationDecisionInput {
  executionCompleted: boolean;
  observedExpectedCondition: boolean;
  traceArtifactCount: number;
  assetDeltaCount: number;
  unsupportedContext?: boolean | undefined;
  timedOut?: boolean | undefined;
  failed?: boolean | undefined;
}

export interface SimulationDecisionResult {
  decision: SimulationStatus;
  rationale: string;
  suggestedConfidenceAdjustment: string | null;
}

export function decideSimulation(input: SimulationDecisionInput): SimulationDecisionResult {
  if (input.timedOut) {
    return result("TIMEOUT", "Simulation timed out before a decision could be made.", null);
  }
  if (input.failed) {
    return result("FAILED", "Simulation failed operationally before a proof artifact was produced.", null);
  }
  if (input.unsupportedContext) {
    return result("INCONCLUSIVE", "Persisted context was insufficient or unsupported for a safe local proof.", null);
  }
  if (input.observedExpectedCondition && (input.traceArtifactCount > 0 || input.assetDeltaCount > 0)) {
    return result(
      "REPRODUCED",
      "Local fork execution produced trace or asset-delta proof for the expected condition.",
      "Consider increasing confidence only after human review of the local proof artifacts."
    );
  }
  if (input.observedExpectedCondition) {
    return result("INCONCLUSIVE", "Expected condition was reported without trace or asset-delta proof artifacts.", null);
  }
  if (input.executionCompleted) {
    return result("NOT_REPRODUCED", "Local execution completed and the expected condition was not observed.", null);
  }
  return result("INCONCLUSIVE", "Simulation did not produce enough evidence for a defensive proof decision.", null);
}

function result(
  decision: SimulationStatus,
  rationale: string,
  suggestedConfidenceAdjustment: string | null
): SimulationDecisionResult {
  return { decision, rationale, suggestedConfidenceAdjustment };
}
