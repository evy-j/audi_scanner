import pino from "pino";
import { env } from "../../config/environment.js";
import { redactSecretLikeValues } from "./redaction.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: "audit-scanner-api",
    environment: env.NODE_ENV
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "passwordHash",
      "token",
      "refreshToken",
      "apiKey",
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.refreshToken",
      "*.apiKey"
    ],
    censor: "[REDACTED]"
  },
  hooks: {
    logMethod(args, method) {
      method.apply(this, args.map((arg) => redactSecretLikeValues(arg)) as [unknown, string?, ...unknown[]]);
    }
  }
});
