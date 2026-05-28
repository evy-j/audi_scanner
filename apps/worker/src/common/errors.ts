export class CancelledScanError extends Error {
  constructor(scanId: string) {
    super(`Scan ${scanId} was cancelled`);
    this.name = "CancelledScanError";
  }
}

export class TimeoutExceededError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`${operation} exceeded timeout of ${timeoutMs}ms`);
    this.name = "TimeoutExceededError";
  }
}

export class ConcurrencyLimitExceededError extends Error {
  constructor(organizationId: string) {
    super(`Organization ${organizationId} has reached its scan concurrency limit`);
    this.name = "ConcurrencyLimitExceededError";
  }
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getErrorStack(error: unknown): string[] | undefined {
  if (!(error instanceof Error) || !error.stack) {
    return undefined;
  }

  return error.stack.split("\n").map((line) => line.trim());
}
