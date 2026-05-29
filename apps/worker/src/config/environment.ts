import { z } from "zod";

const positiveInt = (defaultValue: number) =>
  z.coerce.number().int().positive().default(defaultValue);

const nonNegativeInt = (defaultValue: number) =>
  z.coerce.number().int().nonnegative().default(defaultValue);

const bool = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "n", "off", ""].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean());

const optionalString = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .nullable()
  .default(null);

const octalMode = (defaultValue: number) =>
  z
    .union([z.string(), z.number()])
    .default(defaultValue)
    .transform((value, context) => {
      if (typeof value === "number") {
        return value;
      }

      const normalized = value.trim();
      const parsed = Number.parseInt(normalized, normalized.startsWith("0") ? 8 : 10);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0o777) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Expected a Unix file mode between 0000 and 0777"
        });
        return z.NEVER;
      }
      return parsed;
    });

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "staging", "production"])
      .default("development"),
    DATABASE_URL: z.string().url(),
    API_BASE_URL: z.string().url().default("http://localhost:4000/api/v1"),
    WEB_BASE_URL: z.string().url().default("http://localhost:3000"),
    LOG_LEVEL: z
      .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
      .default("info"),
    WORKER_ID: z.string().optional(),
    WORKER_HOSTNAME: z.string().optional(),
    REDIS_URL: z.string().url().default("redis://localhost:6379"),
    REDIS_KEY_PREFIX: z.string().default("audit-scanner"),
    REDIS_ENABLE_TLS: bool.default(false),
    REDIS_COMMAND_TIMEOUT_MS: positiveInt(10_000),
    REDIS_HEALTH_TIMEOUT_MS: positiveInt(2_500),
    REDIS_CONNECT_FAMILY: z.coerce.number().int().refine((value) => [0, 4, 6].includes(value), { message: "REDIS_CONNECT_FAMILY must be 0, 4, or 6" }).default(0),
    WORKER_REDIS_PREFLIGHT: bool.default(true),
    SINGLE_SERVICE_WORKER_STRICT: bool.default(false),
    WORKER_HEARTBEAT_INTERVAL_MS: positiveInt(15_000),
    WORKER_HEARTBEAT_TTL_MS: positiveInt(45_000),
    JOB_LOCK_DURATION_MS: positiveInt(120_000),
    JOB_STALLED_INTERVAL_MS: positiveInt(30_000),
    JOB_MAX_STALLED_COUNT: nonNegativeInt(2),
    QUEUE_EVENTS_MAX_LEN: positiveInt(10_000),
    WORKER_QUEUE_EVENTS_ENABLED: bool.default(false),
    DEFAULT_ORG_CONCURRENCY: positiveInt(3),
    ORG_CONCURRENCY_LEASE_MS: positiveInt(120_000),
    ORG_CONCURRENCY_REQUEUE_DELAY_MS: positiveInt(5_000),
    CONCURRENCY_SCAN_ORCHESTRATOR: positiveInt(10),
    CONCURRENCY_SOURCE_PREPARE: positiveInt(8),
    CONCURRENCY_BUILD_COMPILE: positiveInt(4),
    CONCURRENCY_SLITHER: positiveInt(4),
    CONCURRENCY_MYTHRIL: positiveInt(2),
    CONCURRENCY_SEMGREP: positiveInt(4),
    CONCURRENCY_ADERYN: positiveInt(4),
    CONCURRENCY_FOUNDRY: positiveInt(2),
    CONCURRENCY_FINDINGS_NORMALIZE: positiveInt(8),
    CONCURRENCY_RISK_SCORE: positiveInt(8),
    CONCURRENCY_AI_VALIDATE: positiveInt(4),
    CONCURRENCY_AI_REPORT: positiveInt(4),
    CONCURRENCY_PDF_GENERATE: positiveInt(4),
    CONCURRENCY_NOTIFICATIONS: positiveInt(16),
    SCANNER_EXECUTION_MODE: z.enum(["container"]).default("container"),
    SCANNER_DOCKER_BINARY: z.string().default("docker"),
    STORAGE_DRIVER: z.enum(["local", "s3", "r2"]).default("local"),
    LOCAL_ARTIFACT_DIR: z.string().default(".artifacts"),
    ARTIFACT_STORE_DRIVER: z.enum(["local", "s3"]).default("local"),
    SCANNER_ARTIFACT_ROOT: z.string().default(".artifacts"),
    SCANNER_TEMP_ROOT: z.string().default(".scanner-tmp"),
    ARTIFACT_S3_ENDPOINT: z.string().url().optional(),
    ARTIFACT_S3_REGION: z.string().default("auto"),
    ARTIFACT_S3_BUCKET: z.string().optional(),
    ARTIFACT_S3_ACCESS_KEY_ID: z.string().optional(),
    ARTIFACT_S3_SECRET_ACCESS_KEY: z.string().optional(),
    ARTIFACT_S3_SESSION_TOKEN: z.string().optional(),
    ARTIFACT_S3_PREFIX: z.string().default(""),
    ARTIFACT_S3_FORCE_PATH_STYLE: bool.default(true),
    REPORT_SHARE_SECRET: z.string().min(32).default("development-report-share-secret-change-me-32"),
    SIMULATION_ENABLED: bool.default(false),
    SIMULATION_SAFETY_LEVEL: z.enum(["LOCAL_ONLY", "TESTNET_ONLY", "DISABLED"]).default("LOCAL_ONLY"),
    SIMULATION_RPC_URL: z.string().url().optional(),
    SIMULATION_MAX_DURATION_MS: positiveInt(30_000),
    SIMULATION_MAX_OUTPUT_BYTES: positiveInt(1_000_000),
    FUZZING_ENABLED: bool.default(false),
    FUZZING_SAFETY_LEVEL: z.enum(["LOCAL_ONLY", "DISABLED"]).default("LOCAL_ONLY"),
    FUZZING_MAX_DURATION_MS: positiveInt(60_000),
    FUZZING_MAX_OUTPUT_BYTES: positiveInt(1_000_000),
    FUZZING_DEFAULT_RUNS: positiveInt(256),
    SCANNER_CLEANUP_TEMP_WORKSPACE: bool.default(true),
    SCANNER_TEMP_RETENTION_MS: positiveInt(24 * 60 * 60 * 1000),
    SCANNER_WORKSPACE_MOUNT_PATH: z.string().default("/workspace"),
    SCANNER_OUTPUT_MOUNT_PATH: z.string().default("/output"),
    SCANNER_NETWORK_MODE: z.enum(["none", "bridge"]).default("none"),
    SCANNER_IPC_MODE: z.enum(["none", "private"]).default("none"),
    SCANNER_READ_ONLY_ROOT_FILESYSTEM: bool.default(true),
    SCANNER_NO_NEW_PRIVILEGES: bool.default(true),
    SCANNER_DOCKER_PULL_POLICY: z.enum(["never", "missing", "always"]).default("never"),
    SCANNER_CONTAINER_USER: z.string().regex(/^\d+:\d+$/).default("10001:10001"),
    SCANNER_SECCOMP_PROFILE: optionalString,
    SCANNER_APPARMOR_PROFILE: optionalString,
    SCANNER_DISABLE_SWAP: bool.default(true),
    SCANNER_TMPFS_NOEXEC: bool.default(true),
    SCANNER_ULIMIT_NOFILE: positiveInt(1024),
    SCANNER_OUTPUT_DIRECTORY_MODE: octalMode(0o777),
    SCANNER_DOCKER_LABEL_PREFIX: z.string().regex(/^[a-zA-Z0-9_.-]+$/).default("audit-scanner"),
    SCANNER_PIDS_LIMIT: positiveInt(256),
    SCANNER_TMPFS_SIZE_MB: positiveInt(256),
    SCANNER_MAX_STDOUT_BYTES: positiveInt(20 * 1024 * 1024),
    SCANNER_MAX_STDERR_BYTES: positiveInt(20 * 1024 * 1024),
    SCANNER_MAX_OUTPUT_ARTIFACTS: positiveInt(64),
    SCANNER_MAX_OUTPUT_ARTIFACT_BYTES: positiveInt(100 * 1024 * 1024),
    SCANNER_STOP_GRACE_SECONDS: positiveInt(5),
    SCANNER_DEFAULT_CPU_LIMIT: z.coerce.number().positive().default(1),
    SCANNER_DEFAULT_MEMORY_MB: positiveInt(2048),
    BUILD_TIMEOUT_MS: positiveInt(20 * 60_000),
    BUILD_TEST_TIMEOUT_MS: positiveInt(30 * 60_000),
    BUILD_MAX_STDOUT_BYTES: positiveInt(20 * 1024 * 1024),
    BUILD_MAX_STDERR_BYTES: positiveInt(20 * 1024 * 1024),
    BUILD_MAX_COMPILER_ARTIFACTS: positiveInt(128),
    BUILD_MAX_COMPILER_ARTIFACT_BYTES: positiveInt(200 * 1024 * 1024),
    BUILD_ALLOW_DEPENDENCY_INSTALL: bool.default(false),
    SLITHER_CPU_LIMIT: z.coerce.number().positive().default(2),
    SLITHER_MEMORY_MB: positiveInt(4096),
    SLITHER_SCANNER_IMAGE: z.string().default("audit-scanner/scanner-slither:latest"),
    MYTHRIL_CPU_LIMIT: z.coerce.number().positive().default(2),
    MYTHRIL_MEMORY_MB: positiveInt(8192),
    MYTHRIL_SCANNER_IMAGE: z.string().default("audit-scanner/scanner-mythril:latest"),
    SEMGREP_CPU_LIMIT: z.coerce.number().positive().default(2),
    SEMGREP_MEMORY_MB: positiveInt(4096),
    SEMGREP_SCANNER_IMAGE: z.string().default("audit-scanner/scanner-semgrep:latest"),
    ADERYN_CPU_LIMIT: z.coerce.number().positive().default(2),
    ADERYN_MEMORY_MB: positiveInt(4096),
    ADERYN_SCANNER_IMAGE: z.string().default("audit-scanner/scanner-aderyn:latest"),
    FOUNDRY_SCANNER_IMAGE: z.string().default("audit-scanner/scanner-foundry:latest"),
    SEMGREP_RULESET: z.string().default("auto"),
    SEMGREP_JOBS: positiveInt(2),
    MYTHRIL_MAX_DEPTH: positiveInt(64),
    MYTHRIL_TRANSACTION_COUNT: positiveInt(3),
    MYTHRIL_SOLVER_TIMEOUT_MS: positiveInt(10_000),
    AI_ENABLED: bool.default(false),
    AI_PROVIDER: z.enum(["OPENAI", "ANTHROPIC", "GEMINI", "DEEPSEEK", "LOCAL", "DISABLED"]).default("DISABLED"),
    AI_MODEL: z.string().optional(),
    AI_API_KEY: z.string().optional(),
    AI_BASE_URL: z.string().url().optional(),
    AI_MAX_TOKENS: positiveInt(2_000),
    AI_TIMEOUT_MS: positiveInt(45_000),
    AI_REPORT_PROVIDER: z.enum(["disabled", "openai-compatible"]).default("disabled"),
    AI_REPORT_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
    AI_REPORT_API_KEY: z.string().optional(),
    AI_REPORT_MODEL: z.string().optional(),
    AI_REPORT_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.2),
    AI_REPORT_TIMEOUT_MS: positiveInt(45_000),
    AI_REPORT_MAX_INPUT_FINDINGS: positiveInt(25),
    AI_REPORT_MAX_OUTPUT_TOKENS: positiveInt(4_000),
    REPORT_PDF_RENDERER: z.enum(["basic"]).default("basic"),
    GLOBAL_CONCURRENCY_SCAN_ORCHESTRATOR: positiveInt(100),
    GLOBAL_CONCURRENCY_SOURCE_PREPARE: positiveInt(50),
    GLOBAL_CONCURRENCY_BUILD_COMPILE: positiveInt(20),
    GLOBAL_CONCURRENCY_SLITHER: positiveInt(20),
    GLOBAL_CONCURRENCY_MYTHRIL: positiveInt(8),
    GLOBAL_CONCURRENCY_SEMGREP: positiveInt(30),
    GLOBAL_CONCURRENCY_ADERYN: positiveInt(30),
    GLOBAL_CONCURRENCY_FOUNDRY: positiveInt(10),
    GLOBAL_CONCURRENCY_FINDINGS_NORMALIZE: positiveInt(100),
    GLOBAL_CONCURRENCY_RISK_SCORE: positiveInt(100),
    GLOBAL_CONCURRENCY_AI_VALIDATE: positiveInt(30),
    GLOBAL_CONCURRENCY_AI_REPORT: positiveInt(30),
    GLOBAL_CONCURRENCY_PDF_GENERATE: positiveInt(30),
    GLOBAL_CONCURRENCY_NOTIFICATIONS: positiveInt(200)
  })
  .superRefine((value, context) => {
    if (value.STORAGE_DRIVER !== "local" && value.ARTIFACT_STORE_DRIVER === "local") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ARTIFACT_STORE_DRIVER"],
        message: "ARTIFACT_STORE_DRIVER must use object storage when STORAGE_DRIVER is not local"
      });
    }

    if (value.AI_REPORT_PROVIDER === "openai-compatible" && !value.AI_REPORT_API_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AI_REPORT_API_KEY"],
        message: "AI_REPORT_API_KEY is required when AI_REPORT_PROVIDER is openai-compatible"
      });
    }

    if (value.ARTIFACT_STORE_DRIVER === "s3") {
      for (const key of [
        "ARTIFACT_S3_ENDPOINT",
        "ARTIFACT_S3_BUCKET",
        "ARTIFACT_S3_ACCESS_KEY_ID",
        "ARTIFACT_S3_SECRET_ACCESS_KEY"
      ] as const) {
        if (!value[key]) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when ARTIFACT_STORE_DRIVER=s3`
          });
        }
      }
    }

    if (value.SIMULATION_ENABLED && value.SIMULATION_SAFETY_LEVEL !== "LOCAL_ONLY") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SIMULATION_SAFETY_LEVEL"],
        message: "P7 simulations must use LOCAL_ONLY safety level"
      });
    }

    if (value.FUZZING_ENABLED && value.FUZZING_SAFETY_LEVEL !== "LOCAL_ONLY") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FUZZING_SAFETY_LEVEL"],
        message: "P8 fuzzing must use LOCAL_ONLY safety level"
      });
    }

    if (value.NODE_ENV !== "production") {
      return;
    }

    for (const [path, hardened] of [
      ["SCANNER_NETWORK_MODE", value.SCANNER_NETWORK_MODE === "none"],
      ["SCANNER_IPC_MODE", value.SCANNER_IPC_MODE === "none"],
      ["SCANNER_READ_ONLY_ROOT_FILESYSTEM", value.SCANNER_READ_ONLY_ROOT_FILESYSTEM],
      ["SCANNER_NO_NEW_PRIVILEGES", value.SCANNER_NO_NEW_PRIVILEGES],
      ["SCANNER_DISABLE_SWAP", value.SCANNER_DISABLE_SWAP],
      ["SCANNER_TMPFS_NOEXEC", value.SCANNER_TMPFS_NOEXEC]
    ] as const) {
      if (!hardened) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [path],
          message: `${path} must use the hardened default in production`
        });
      }
    }
  });

export type WorkerEnvironment = z.infer<typeof envSchema>;

export interface SafeConfigIssue {
  path: string;
  message: string;
}

export class ConfigurationError extends Error {
  readonly code = "CONFIGURATION_ERROR";

  constructor(readonly issues: SafeConfigIssue[]) {
    super("Startup configuration is invalid");
    this.name = "ConfigurationError";
  }
}

export function parseWorkerEnvironment(input: NodeJS.ProcessEnv = process.env): WorkerEnvironment {
  const normalized = normalizeInput(input);
  const result = envSchema.safeParse(normalized);
  if (!result.success) {
    throw new ConfigurationError(
      result.error.issues.map((issue) => ({
        path: issue.path.join(".") || "environment",
        message: redactConfigValue(issue.message)
      }))
    );
  }
  return result.data;
}

export function validateWorkerStartupConfig(input: NodeJS.ProcessEnv = process.env): WorkerEnvironment {
  return parseWorkerEnvironment(input);
}

export const env: WorkerEnvironment = parseWorkerEnvironment();

export function getWorkerId(): string {
  return (
    env.WORKER_ID ??
    `${env.WORKER_HOSTNAME ?? "worker"}-${process.pid}-${Date.now().toString(36)}`
  );
}

function normalizeInput(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const storageDriver = input.STORAGE_DRIVER ?? input.ARTIFACT_STORE_DRIVER;
  const localArtifactDir = input.LOCAL_ARTIFACT_DIR ?? input.SCANNER_ARTIFACT_ROOT;
  const artifactStoreDriver =
    storageDriver === "r2" ? "s3" : storageDriver ?? input.ARTIFACT_STORE_DRIVER;
  return {
    ...input,
    ...(storageDriver ? { STORAGE_DRIVER: storageDriver } : {}),
    ...(artifactStoreDriver ? { ARTIFACT_STORE_DRIVER: artifactStoreDriver } : {}),
    ...(localArtifactDir ? { LOCAL_ARTIFACT_DIR: localArtifactDir, SCANNER_ARTIFACT_ROOT: localArtifactDir } : {})
  };
}

export function redactConfigValue(value: string): string {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s]+/giu, "[REDACTED_DATABASE_URL]")
    .replace(/redis(?:s)?:\/\/[^\s]+/giu, "[REDACTED_REDIS_URL]")
    .replace(/https?:\/\/[^\s"'<>]*(?:alchemy|infura|quicknode|rpc)[^\s"'<>]*/giu, "[REDACTED_RPC_URL]")
    .replace(/(sk-[A-Za-z0-9_-]{8,})/gu, "[REDACTED_API_KEY]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu, "[REDACTED_JWT]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu, "[REDACTED_PRIVATE_KEY]");
}
