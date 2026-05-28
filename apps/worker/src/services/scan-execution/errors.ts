export class ScannerExecutionFailedError extends Error {
  constructor(
    message: string,
    readonly details: {
      analyzer: string;
      scanId: string;
      status: "COMPLETED" | "FAILED" | "TIMED_OUT" | "CANCELED";
      exitCode: number | null;
      rawArtifactKey?: string | undefined;
      rawArtifactChecksumSha256?: string | undefined;
      standardizedArtifactKey: string;
    }
  ) {
    super(message);
    this.name = "ScannerExecutionFailedError";
  }
}
