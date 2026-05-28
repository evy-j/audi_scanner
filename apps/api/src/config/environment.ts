import { z } from "zod";

const DEVELOPMENT_ACCESS_SECRET = "development-access-secret-change-me-32";
const DEVELOPMENT_REFRESH_SECRET = "development-refresh-secret-change-me-32";
const DEVELOPMENT_API_KEY_SECRET = "development-api-key-secret-change-me-32";
const DEVELOPMENT_REPORT_SHARE_SECRET = "development-report-share-secret-change-me-32";

const csv = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );

const optionalString = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();

const storageDriver = z.enum(["local", "s3", "r2"]);

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

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "staging", "production"])
      .default("development"),
    DATABASE_URL: z.string().url(),
    API_BASE_URL: z.string().url().default("http://localhost:4000/api/v1"),
    WEB_BASE_URL: z.string().url().default("http://localhost:3000"),
    PORT: z.coerce.number().int().positive().default(4000),
    TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(1),
    HTTP_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
    HTTP_HEADERS_TIMEOUT_MS: z.coerce.number().int().positive().default(65_000),
    HTTP_KEEP_ALIVE_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
    HTTP_SHUTDOWN_GRACE_MS: z.coerce.number().int().positive().default(15_000),
    LOG_LEVEL: z
      .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
      .default("info"),
    READINESS_DIAGNOSTICS: bool.default(false),
    API_BASE_PATH: z.string().default("/api/v1"),
    CORS_ORIGIN: z.string().optional(),
    CORS_ORIGINS: csv,
    REALTIME_WS_PATH: z.string().default("/api/v1/realtime"),
    REALTIME_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(25_000),
    REALTIME_MAX_SUBSCRIPTIONS_PER_CONNECTION: z.coerce.number().int().positive().default(50),
    REALTIME_REPLAY_MAX_EVENTS: z.coerce.number().int().positive().max(500).default(250),
    REALTIME_MAX_MESSAGE_BYTES: z.coerce.number().int().positive().default(65_536),
    REALTIME_MAX_BUFFERED_BYTES: z.coerce.number().int().positive().default(1_048_576),
    REALTIME_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    REALTIME_RATE_LIMIT_MAX_CONNECTIONS: z.coerce.number().int().positive().default(30),
    JWT_ACCESS_SECRET: z.string().min(32).default(DEVELOPMENT_ACCESS_SECRET),
    JWT_REFRESH_SECRET: z.string().min(32).default(DEVELOPMENT_REFRESH_SECRET),
    JWT_SECRET: z.string().min(32).optional(),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
    JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(30 * 24 * 60 * 60),
    API_KEY_HASH_SECRET: z.string().min(32).default(DEVELOPMENT_API_KEY_SECRET),
    REPORT_SHARE_SECRET: z.string().min(32).default(DEVELOPMENT_REPORT_SHARE_SECRET),
    REDIS_URL: z.string().url().default("redis://localhost:6379"),
    REDIS_REQUIRED: bool.default(false),
    REDIS_KEY_PREFIX: z.string().default("audit-scanner"),
    REDIS_ENABLE_TLS: bool.default(false),
    REDIS_COMMAND_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    REDIS_HEALTH_TIMEOUT_MS: z.coerce.number().int().positive().default(2_500),
    REDIS_CONNECT_FAMILY: z.coerce.number().int().refine((value) => [0, 4, 6].includes(value), { message: "REDIS_CONNECT_FAMILY must be 0, 4, or 6" }).default(0),
    QUEUE_BACKEND: z.enum(["auto", "redis", "disabled"]).default("auto"),
    QUEUE_READY_STRICT: bool.default(false),
    SINGLE_SERVICE_WORKER_ENABLED: bool.default(false),
    SINGLE_SERVICE_WORKER_STRICT: bool.default(false),
    PASSWORD_MIN_LENGTH: z.coerce.number().int().positive().default(12),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(300),
    AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(20),
    SCAN_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(30),
    ACTION_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(20),
    RATE_LIMIT_STORE: z.enum(["redis", "memory"]).default("memory"),
    SCAN_ADMISSION_MAX_QUEUED_JOBS: z.coerce.number().int().positive().default(5_000),
    STORAGE_DRIVER: storageDriver.default("local"),
    LOCAL_ARTIFACT_DIR: z.string().default(".artifacts"),
    S3_ENDPOINT: optionalString,
    S3_REGION: z.string().default("auto"),
    S3_BUCKET: optionalString,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_PREFIX: z.string().default(""),
    FREE_BETA_SCANS_PER_MONTH: z.coerce.number().int().nonnegative().default(25),
    FREE_BETA_AI_VALIDATIONS_PER_MONTH: z.coerce.number().int().nonnegative().default(50),
    FREE_BETA_REMEDIATION_RUNS_PER_MONTH: z.coerce.number().int().nonnegative().default(25),
    FREE_BETA_REPORT_EXPORTS_PER_MONTH: z.coerce.number().int().nonnegative().default(25),
    FREE_BETA_MONITORED_PROJECTS: z.coerce.number().int().nonnegative().default(3),
    SIMULATION_ENABLED: bool.default(false),
    SIMULATION_SAFETY_LEVEL: z.enum(["LOCAL_ONLY", "TESTNET_ONLY", "DISABLED"]).default("LOCAL_ONLY"),
    SIMULATION_RPC_URL: z.string().url().optional(),
    SIMULATION_MAX_DURATION_MS: z.coerce.number().int().positive().default(30_000),
    SIMULATION_MAX_OUTPUT_BYTES: z.coerce.number().int().positive().default(1_000_000),
    FUZZING_ENABLED: bool.default(false),
    FUZZING_SAFETY_LEVEL: z.enum(["LOCAL_ONLY", "DISABLED"]).default("LOCAL_ONLY"),
    FUZZING_MAX_DURATION_MS: z.coerce.number().int().positive().default(60_000),
    FUZZING_MAX_OUTPUT_BYTES: z.coerce.number().int().positive().default(1_000_000),
    FUZZING_DEFAULT_RUNS: z.coerce.number().int().positive().default(256),
    MONITORING_ENABLED: bool.default(false),
    MONITORING_RPC_URL: z.string().url().optional(),
    MONITORING_CHAIN_ID: z.coerce.number().int().positive().optional(),
    MONITORING_PROVIDER_NAME: z.string().default("configured-rpc"),
    MONITORING_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
    MONITORING_MAX_BLOCK_RANGE: z.coerce.number().int().positive().max(5_000).default(100),
    MONITORING_REORG_DEPTH: z.coerce.number().int().nonnegative().max(256).default(6),
    MONITORING_MAX_EVENTS_PER_RUN: z.coerce.number().int().positive().max(10_000).default(1_000),
    MONITORING_WEBHOOKS_ENABLED: bool.default(false),
    GITHUB_APP_ID: optionalString,
    GITHUB_APP_PRIVATE_KEY: optionalString,
    GITHUB_APP_WEBHOOK_SECRET: optionalString,
    GITHUB_APP_CLIENT_ID: optionalString,
    GITHUB_APP_CLIENT_SECRET: optionalString,
    GITHUB_APP_NAME: optionalString,
    BILLING_ENABLED: bool.default(false),
    BILLING_PROVIDER: z.enum(["DISABLED", "RAZORPAY", "STRIPE", "MANUAL"]).default("DISABLED"),
    BILLING_WEBHOOK_SECRET: optionalString,
    BILLING_SUCCESS_URL: optionalString,
    BILLING_CANCEL_URL: optionalString,
    BILLING_CURRENCY: z.string().default("INR"),
    BILLING_TEST_MODE: bool.default(true),
    RAZORPAY_KEY_ID: optionalString,
    RAZORPAY_KEY_SECRET: optionalString,
    RAZORPAY_WEBHOOK_SECRET: optionalString,
    STRIPE_SECRET_KEY: optionalString,
    STRIPE_WEBHOOK_SECRET: optionalString,
    STRIPE_PUBLISHABLE_KEY: optionalString,
    AI_ENABLED: bool.default(false),
    AI_PROVIDER: z.enum(["OPENAI", "ANTHROPIC", "GEMINI", "DEEPSEEK", "LOCAL", "DISABLED"]).default("DISABLED"),
    AI_MODEL: z.string().optional(),
    AI_API_KEY: z.string().optional(),
    AI_BASE_URL: z.string().url().optional(),
    AI_MAX_TOKENS: z.coerce.number().int().positive().default(2_000),
    AI_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
    OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().positive().default(2_000),
    OUTBOX_RELAY_BATCH_SIZE: z.coerce.number().int().positive().max(100).default(25),
    OUTBOX_RELAY_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10)
  })
  .superRefine((value, context) => {
    const corsOrigins = value.CORS_ORIGINS.length > 0 ? value.CORS_ORIGINS : value.CORS_ORIGIN ? [value.CORS_ORIGIN] : [];
    for (const origin of corsOrigins) {
      if (origin === "*") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CORS_ORIGINS"],
          message: "Wildcard CORS origins are not allowed"
        });
        continue;
      }
      if (!isHttpOrigin(origin)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CORS_ORIGINS"],
          message: "CORS origins must be valid http(s) origins without paths"
        });
      }
      if (value.NODE_ENV === "development" && !isLocalhostOrigin(origin)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CORS_ORIGINS"],
          message: "Development CORS origins must be localhost"
        });
      }
    }

    if (value.STORAGE_DRIVER !== "local") {
      for (const key of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
        if (!value[key]) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when STORAGE_DRIVER is not local`
          });
        }
      }
    }

    if (value.AI_ENABLED && value.AI_PROVIDER === "DISABLED") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AI_PROVIDER"],
        message: "AI_PROVIDER must be configured when AI_ENABLED=true"
      });
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

    if (value.MONITORING_ENABLED && (!value.MONITORING_RPC_URL || !value.MONITORING_CHAIN_ID)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MONITORING_RPC_URL"],
        message: "MONITORING_RPC_URL and MONITORING_CHAIN_ID are required when MONITORING_ENABLED=true"
      });
    }

    if (value.NODE_ENV !== "production") {
      return;
    }

    if (value.CORS_ORIGINS.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ORIGINS"],
        message: "CORS_ORIGINS must be explicitly set in production"
      });
    }

    for (const [path, secret, developmentValue] of [
      ["JWT_ACCESS_SECRET", value.JWT_ACCESS_SECRET, DEVELOPMENT_ACCESS_SECRET],
      ["JWT_REFRESH_SECRET", value.JWT_REFRESH_SECRET, DEVELOPMENT_REFRESH_SECRET],
      ["API_KEY_HASH_SECRET", value.API_KEY_HASH_SECRET, DEVELOPMENT_API_KEY_SECRET],
      ["REPORT_SHARE_SECRET", value.REPORT_SHARE_SECRET, DEVELOPMENT_REPORT_SHARE_SECRET]
    ] as const) {
      if (secret === developmentValue) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [path],
          message: `${path} must not use the development default in production`
        });
      }
    }
  });

export type ApiEnvironment = z.infer<typeof envSchema>;

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

export function parseApiEnvironment(input: NodeJS.ProcessEnv = process.env): ApiEnvironment {
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

export function validateApiStartupConfig(input: NodeJS.ProcessEnv = process.env): ApiEnvironment {
  return parseApiEnvironment(input);
}

export const env: ApiEnvironment = parseApiEnvironment();

function normalizeInput(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const jwtSecret = input.JWT_SECRET;
  const corsOrigins = input.CORS_ORIGINS ?? input.CORS_ORIGIN;
  const storageDriver = input.STORAGE_DRIVER ?? input.ARTIFACT_STORE_DRIVER;
  const localArtifactDir = input.LOCAL_ARTIFACT_DIR ?? input.SCANNER_ARTIFACT_ROOT;
  return {
    ...input,
    ...(corsOrigins ? { CORS_ORIGINS: corsOrigins, CORS_ORIGIN: input.CORS_ORIGIN ?? corsOrigins } : {}),
    ...(jwtSecret && !input.JWT_ACCESS_SECRET ? { JWT_ACCESS_SECRET: jwtSecret } : {}),
    ...(jwtSecret && !input.JWT_REFRESH_SECRET ? { JWT_REFRESH_SECRET: jwtSecret } : {}),
    ...(storageDriver ? { STORAGE_DRIVER: storageDriver } : {}),
    ...(localArtifactDir ? { LOCAL_ARTIFACT_DIR: localArtifactDir } : {})
  };
}

function isHttpOrigin(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.origin === value.replace(/\/$/u, "");
  } catch {
    return false;
  }
}

function isLocalhostOrigin(value: string): boolean {
  try {
    const parsed = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export function redactConfigValue(value: string): string {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s]+/giu, "[REDACTED_DATABASE_URL]")
    .replace(/redis(?:s)?:\/\/[^\s]+/giu, "[REDACTED_REDIS_URL]")
    .replace(/https?:\/\/[^\s"'<>]*(?:alchemy|infura|quicknode|rpc)[^\s"'<>]*/giu, "[REDACTED_RPC_URL]")
    .replace(/MONITORING_RPC_URL\s*=\s*[^\s]+/giu, "MONITORING_RPC_URL=[REDACTED_RPC_URL]")
    .replace(/GITHUB_APP_PRIVATE_KEY\s*=\s*[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----/gu, "GITHUB_APP_PRIVATE_KEY=[REDACTED_PRIVATE_KEY]")
    .replace(/GITHUB_APP_WEBHOOK_SECRET\s*=\s*[^\s]+/giu, "GITHUB_APP_WEBHOOK_SECRET=[REDACTED_SECRET]")
    .replace(/GITHUB_APP_CLIENT_SECRET\s*=\s*[^\s]+/giu, "GITHUB_APP_CLIENT_SECRET=[REDACTED_SECRET]")
    .replace(/BILLING_WEBHOOK_SECRET\s*=\s*[^\s]+/giu, "BILLING_WEBHOOK_SECRET=[REDACTED_SECRET]")
    .replace(/RAZORPAY_KEY_SECRET\s*=\s*[^\s]+/giu, "RAZORPAY_KEY_SECRET=[REDACTED_SECRET]")
    .replace(/RAZORPAY_WEBHOOK_SECRET\s*=\s*[^\s]+/giu, "RAZORPAY_WEBHOOK_SECRET=[REDACTED_SECRET]")
    .replace(/STRIPE_SECRET_KEY\s*=\s*[^\s]+/giu, "STRIPE_SECRET_KEY=[REDACTED_SECRET]")
    .replace(/STRIPE_WEBHOOK_SECRET\s*=\s*[^\s]+/giu, "STRIPE_WEBHOOK_SECRET=[REDACTED_SECRET]")
    .replace(/\bsk_(?:live|test)_[A-Za-z0-9]+/gu, "[REDACTED_STRIPE_SECRET]")
    .replace(/\brzp_(?:live|test)_[A-Za-z0-9]+/gu, "[REDACTED_RAZORPAY_KEY]")
    .replace(/ghs_[A-Za-z0-9_]+/gu, "[REDACTED_GITHUB_TOKEN]")
    .replace(/ghp_[A-Za-z0-9_]+/gu, "[REDACTED_GITHUB_TOKEN]")
    .replace(/(sk-[A-Za-z0-9_-]{8,})/gu, "[REDACTED_API_KEY]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu, "[REDACTED_JWT]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu, "[REDACTED_PRIVATE_KEY]");
}
