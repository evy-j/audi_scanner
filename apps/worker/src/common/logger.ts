import pino from "pino";
import { env } from "../config/environment.js";
import { redactSecretLikeValues } from "./redaction.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: "scan-worker",
    environment: env.NODE_ENV
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "password",
      "token",
      "accessToken",
      "refreshToken",
      "apiKey",
      "*.password",
      "*.token",
      "*.accessToken",
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

export type Logger = typeof logger;
