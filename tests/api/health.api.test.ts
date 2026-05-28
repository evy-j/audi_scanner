import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../apps/api/src/infra/prisma/prisma.js", () => ({
  prisma: {
    $queryRaw: vi.fn(async () => [{ "?column?": 1 }])
  }
}));

vi.mock("../../apps/api/src/infra/queues/redis.js", () => ({
  redis: {
    incr: vi.fn(async () => 1),
    pexpire: vi.fn(async () => 1),
    pttl: vi.fn(async () => 60_000),
    decr: vi.fn(async () => 0),
    del: vi.fn(async () => 1),
    ping: vi.fn(async () => "PONG")
  },
  redisKey: (...parts: string[]) => parts.join(":")
}));

describe("API health", () => {
  it("returns public service health", async () => {
    const { createApiApp } = await import("../../apps/api/src/app.js");
    const app = createApiApp();

    const response = await request(app).get("/health").expect(200);

    expect(response.body).toMatchObject({
      status: "ok",
      service: "audit-scanner-api"
    });
  });

  it("returns v1 deep health with safe fields only", async () => {
    const { createApiApp } = await import("../../apps/api/src/app.js");
    const app = createApiApp();

    const response = await request(app).get("/api/v1/health/deep").expect(200);

    expect(response.body).toMatchObject({
      status: "ok",
      service: "audit-scanner-api",
      checks: {
        database: "ok",
        redis: "ok",
        workerQueue: "ok"
      },
      aiConfigured: false
    });
    expect(JSON.stringify(response.body)).not.toContain(process.env.DATABASE_URL);
    expect(JSON.stringify(response.body)).not.toContain(process.env.REDIS_URL);
    expect(response.body.version).toMatchObject({
      apiVersion: "v1"
    });
  });
});
