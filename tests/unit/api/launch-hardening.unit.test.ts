import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  ConfigurationError,
  parseApiEnvironment,
  redactConfigValue
} from "../../../apps/api/src/config/environment.js";
import { redactSecretLikeValues } from "../../../apps/api/src/common/logging/redaction.js";
import { buildRateLimit } from "../../../apps/api/src/common/middleware/rate-limit.middleware.js";

const baseEnv = {
  NODE_ENV: "staging",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/audit_scanner",
  REDIS_URL: "redis://localhost:6379",
  API_BASE_URL: "https://api.example.com/api/v1",
  WEB_BASE_URL: "https://app.example.com",
  CORS_ORIGIN: "https://app.example.com",
  JWT_ACCESS_SECRET: "test-access-secret-minimum-32-characters",
  JWT_REFRESH_SECRET: "test-refresh-secret-minimum-32-characters",
  API_KEY_HASH_SECRET: "test-api-key-secret-minimum-32-characters",
  REPORT_SHARE_SECRET: "test-report-share-secret-minimum-32-characters",
  AI_ENABLED: "false",
  AI_PROVIDER: "DISABLED",
  STORAGE_DRIVER: "local",
  LOCAL_ARTIFACT_DIR: ".artifacts-test"
};

describe("launch hardening", () => {
  it("fails config validation when critical env is missing", () => {
    expect(() => parseApiEnvironment({ ...baseEnv, DATABASE_URL: "" })).toThrow(ConfigurationError);
  });

  it("redacts secrets from config errors and logs", () => {
    const redacted = redactConfigValue(
      "postgresql://user:secret@db.example/prod redis://:secret@redis.example:6379 sk-testsecretvalue"
    );

    expect(redacted).toContain("[REDACTED_DATABASE_URL]");
    expect(redacted).toContain("[REDACTED_REDIS_URL]");
    expect(redacted).toContain("[REDACTED_API_KEY]");
    expect(redacted).not.toContain("secret@db");

    expect(
      redactSecretLikeValues({
        token: "Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature",
        key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
        rpc: "https://mainnet.infura.io/v3/super-secret"
      })
    ).toEqual({
      token: "Bearer [REDACTED]",
      key: "[REDACTED_PRIVATE_KEY]",
      rpc: "[REDACTED_RPC_URL]"
    });
  });

  it("rejects wildcard CORS in production", () => {
    expect(() =>
      parseApiEnvironment({
        ...baseEnv,
        NODE_ENV: "production",
        CORS_ORIGINS: "*",
        CORS_ORIGIN: "*"
      })
    ).toThrow(ConfigurationError);
  });

  it("returns RATE_LIMITED with a safe payload", async () => {
    const app = express();
    app.get("/limited", buildRateLimit({ namespace: "test", limit: 1, windowMs: 60_000, store: "memory" }), (_req, res) => {
      res.json({ ok: true });
    });

    await request(app).get("/limited").expect(200);
    const response = await request(app).get("/limited").expect(429);

    expect(response.body).toMatchObject({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests"
      }
    });
    expect(response.body.error.stack).toBeUndefined();
  });
});
