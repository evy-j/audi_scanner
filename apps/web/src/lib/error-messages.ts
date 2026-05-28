export interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

const SAFE_MESSAGES: Record<string, string> = {
  PROVIDER_NOT_CONFIGURED: "The required provider is not configured for this workspace.",
  TOOL_NOT_INSTALLED: "The required scanner tool is not installed in this environment.",
  NOT_ASSESSED: "This area has not been assessed yet.",
  LIMIT_EXCEEDED: "This workspace has reached its current beta usage limit.",
  ENTITLEMENT_DENIED: "This action is not available under the current plan or organization security settings.",
  PAYMENT_REQUIRED: "A valid subscription, trial, free beta plan, or admin override is required.",
  SUBSCRIPTION_EXPIRED: "The subscription is expired or inactive; free beta limits may still apply.",
  CHECKOUT_FAILED: "The payment provider could not create checkout. No payment state was changed.",
  PDF_PROVIDER_NOT_CONFIGURED: "PDF export is not configured for this environment.",
  CONFIGURATION_ERROR: "The service is missing required deployment configuration.",
  RATE_LIMITED: "Too many requests. Please wait briefly and try again.",
  DATABASE_UNAVAILABLE: "The database is temporarily unavailable.",
  REDIS_UNAVAILABLE: "The queue service is temporarily unavailable.",
  SERVICE_UNAVAILABLE: "The service is temporarily unavailable.",
  REPRODUCED: "Local simulation reproduced the expected condition with proof artifacts for human review.",
  NOT_REPRODUCED: "Local simulation completed without observing the expected condition.",
  INCONCLUSIVE: "The local run did not have enough proof to make a determination.",
  PASSED: "Local fuzzing or invariant checks passed with persisted tool output.",
  FAILED: "Local fuzzing or invariant checks failed and require human review.",
  NOT_ELIGIBLE: "This item is not eligible for the requested local assessment."
};

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export function safeErrorMessage(input: {
  status?: number | undefined;
  code?: string | undefined;
  message?: string | undefined;
  details?: unknown;
}): string {
  const category = errorCategory(input.details);
  if (category === "PROVIDER_NOT_CONFIGURED" && input.code === "SERVICE_UNAVAILABLE") {
    return messageFor("PROVIDER_NOT_CONFIGURED");
  }
  if (category === "PROVIDER_NOT_CONFIGURED" && input.message?.toLowerCase().includes("pdf")) {
    return messageFor("PDF_PROVIDER_NOT_CONFIGURED");
  }
  if (category && SAFE_MESSAGES[category]) {
    return messageFor(category);
  }
  if (input.code && SAFE_MESSAGES[input.code]) {
    return messageFor(input.code);
  }
  if (input.status && input.status >= 500) {
    return "The service hit an unexpected error. Please try again later.";
  }
  return input.message && !looksLikeStackTrace(input.message) ? input.message : "The request could not be completed.";
}

export function safeSimulationStatusMessage(status: string): string {
  return SAFE_MESSAGES[status] ?? safeErrorMessage({ code: status });
}

export function safeFuzzStatusMessage(status: string): string {
  return SAFE_MESSAGES[status] ?? safeErrorMessage({ code: status });
}

function messageFor(code: string): string {
  return SAFE_MESSAGES[code] ?? "The request could not be completed.";
}

function errorCategory(details: unknown): string | undefined {
  if (!details || typeof details !== "object") return undefined;
  const category = (details as { errorCategory?: unknown }).errorCategory;
  return typeof category === "string" ? category : undefined;
}

function looksLikeStackTrace(value: string): boolean {
  return /\n\s+at\s+/u.test(value) || value.includes("node_modules") || value.includes("PrismaClient");
}
