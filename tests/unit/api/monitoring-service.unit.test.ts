import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config/environment.js";
import { COMMON_EVENT_TOPICS } from "../../../apps/api/src/modules/monitoring/event-signatures.js";
import { MonitoringService } from "../../../apps/api/src/modules/monitoring/monitoring.service.js";
import { redactRpcUrl } from "../../../apps/api/src/modules/monitoring/redaction.js";
import { MonitorRuleEngine } from "../../../apps/api/src/modules/monitoring/rule-engine.js";
import { WebhookDeliveryService } from "../../../apps/api/src/modules/monitoring/webhook-delivery.js";

const original = {
  enabled: env.MONITORING_ENABLED,
  rpcUrl: env.MONITORING_RPC_URL,
  chainId: env.MONITORING_CHAIN_ID,
  reorgDepth: env.MONITORING_REORG_DEPTH,
  maxBlockRange: env.MONITORING_MAX_BLOCK_RANGE,
  maxEvents: env.MONITORING_MAX_EVENTS_PER_RUN,
  webhooks: env.MONITORING_WEBHOOKS_ENABLED
};

beforeEach(() => {
  env.MONITORING_ENABLED = true;
  env.MONITORING_RPC_URL = "https://eth-mainnet.g.alchemy.com/v2/super-secret";
  env.MONITORING_CHAIN_ID = 1;
  env.MONITORING_REORG_DEPTH = 0;
  env.MONITORING_MAX_BLOCK_RANGE = 10;
  env.MONITORING_MAX_EVENTS_PER_RUN = 10;
  env.MONITORING_WEBHOOKS_ENABLED = false;
});

afterEach(() => {
  env.MONITORING_ENABLED = original.enabled;
  env.MONITORING_RPC_URL = original.rpcUrl;
  env.MONITORING_CHAIN_ID = original.chainId;
  env.MONITORING_REORG_DEPTH = original.reorgDepth;
  env.MONITORING_MAX_BLOCK_RANGE = original.maxBlockRange;
  env.MONITORING_MAX_EVENTS_PER_RUN = original.maxEvents;
  env.MONITORING_WEBHOOKS_ENABLED = original.webhooks;
  vi.clearAllMocks();
});

describe("MonitoringService", () => {
  it("returns DISABLED / NOT_ASSESSED when monitoring is disabled", async () => {
    env.MONITORING_ENABLED = false;
    const harness = createHarness([]);

    const result = await harness.service.runOnce("project-1", { organizationId: "org-1" });

    expect(result.status).toBe("DISABLED");
    expect(harness.repository.completeRun).toHaveBeenCalledWith("run-1", expect.objectContaining({
      status: "NOT_ASSESSED",
      errorCategory: "DISABLED"
    }));
  });

  it("redacts RPC URLs", () => {
    expect(redactRpcUrl("https://rpc.example.com/team/secret-key?api_key=abc")).toContain("[REDACTED]");
    expect(redactRpcUrl("https://rpc.example.com/team/secret-key?api_key=abc")).not.toContain("secret-key?api_key=abc");
  });

  it("persists cursor, deduplicates events, and creates evidence-backed alerts", async () => {
    const logs = [
      log(COMMON_EVENT_TOPICS.Upgraded, "0xabc", 7),
      log(COMMON_EVENT_TOPICS.Upgraded, "0xabc", 7),
      log(COMMON_EVENT_TOPICS.OwnershipTransferred, "0xdef", 8)
    ];
    const harness = createHarness(logs);

    const result = await harness.service.runOnce("project-1", { organizationId: "org-1" });

    expect(result.status).toBe("OBSERVED");
    expect(harness.repository.upsertCursor).toHaveBeenCalledWith(expect.objectContaining({
      lastProcessedBlock: 110n,
      status: "OBSERVED"
    }));
    expect(harness.events.size).toBe(2);
    expect(harness.alerts.size).toBe(2);
    expect([...harness.alerts.values()]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "PROXY_UPGRADE",
        evidence: [expect.objectContaining({ transactionHash: "0xabc" })]
      }),
      expect.objectContaining({
        kind: "OWNERSHIP_TRANSFER",
        evidence: [expect.objectContaining({ transactionHash: "0xdef" })]
      })
    ]));
    expect([...harness.events.values()][0]).toMatchObject({
      eventName: null,
      decodedData: null,
      decodeStatus: "NOT_ASSESSED",
      rawArtifactPath: expect.any(String)
    });
  });

  it("does not create alert candidates without evidence", () => {
    const engine = new MonitorRuleEngine();
    const candidates = engine.evaluateTransaction(target(), [rule("PRIVILEGED_FUNCTION_CALL")], {
      id: "tx-1",
      chainId: 1,
      hash: "0xhash",
      blockNumber: 1n,
      blockHash: "0xblock",
      input: "0x",
      observedAt: new Date()
    });

    expect(candidates).toEqual([]);
  });
});

describe("WebhookDeliveryService", () => {
  it("signs alert payloads", async () => {
    env.MONITORING_WEBHOOKS_ENABLED = true;
    const repository = {
      activeWebhooks: vi.fn(async () => [{
        id: "webhook-1",
        url: "https://hooks.example.test/alerts",
        redactedUrl: "https://hooks.example.test/[REDACTED]",
        signingSecret: "minimum-16-char-secret"
      }]),
      createDelivery: vi.fn(async () => ({})),
      touchWebhook: vi.fn(async () => ({}))
    };
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const service = new WebhookDeliveryService(repository as any, fetchImpl as any);

    await service.deliverForAlerts([{
      id: "alert-1",
      organizationId: "org-1",
      projectId: "project-1",
      kind: "PROXY_UPGRADE",
      severity: "HIGH",
      status: "OPEN",
      title: "Proxy upgrade signature observed",
      targetAddress: "0x0000000000000000000000000000000000000001",
      observedAt: new Date("2026-05-25T00:00:00.000Z"),
      evidence: [{ id: "evidence-1" }]
    }]);

    expect(fetchImpl).toHaveBeenCalledWith("https://hooks.example.test/alerts", expect.objectContaining({
      headers: expect.objectContaining({
        "x-web3guard-signature": expect.stringMatching(/^sha256=/u)
      })
    }));
    expect(repository.createDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: "SUCCEEDED" }));
  });

  it("does not send revoked or deleted webhooks returned as inactive", async () => {
    env.MONITORING_WEBHOOKS_ENABLED = true;
    const repository = {
      activeWebhooks: vi.fn(async () => []),
      createDelivery: vi.fn(),
      touchWebhook: vi.fn()
    };
    const fetchImpl = vi.fn();
    const service = new WebhookDeliveryService(repository as any, fetchImpl as any);

    await service.deliverForAlerts([{
      id: "alert-1",
      organizationId: "org-1",
      projectId: "project-1",
      kind: "PROXY_UPGRADE",
      severity: "HIGH",
      status: "OPEN",
      title: "Proxy upgrade signature observed",
      targetAddress: "0x0000000000000000000000000000000000000001",
      observedAt: new Date(),
      evidence: [{ id: "evidence-1" }]
    }]);

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

function createHarness(logs: any[]) {
  const events = new Map<string, any>();
  const alerts = new Map<string, any>();
  const repository = {
    project: vi.fn(async () => ({ id: "project-1", organizationId: "org-1" })),
    createRun: vi.fn(async () => ({ id: "run-1" })),
    completeRun: vi.fn(async (id, input) => ({ id, ...input })),
    activeTargetsForProject: vi.fn(async () => [{
      ...target(),
      rules: [rule("PROXY_UPGRADE"), rule("OWNERSHIP_TRANSFER"), rule("CONTRACT_ACTIVITY_DRIFT")],
      abi: [],
      cursors: [],
      runs: [],
      alerts: []
    }]),
    cursor: vi.fn(async () => ({ lastProcessedBlock: 100n, metadata: { baselineEventCount: 10 } })),
    upsertCursor: vi.fn(async (input) => input),
    upsertTransaction: vi.fn(async (input) => ({
      id: `tx-${input.hash}`,
      chainId: input.chainId,
      hash: input.hash,
      blockNumber: input.blockNumber,
      blockHash: input.blockHash,
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      inputSelector: input.inputSelector,
      input: input.input,
      providerName: input.providerName,
      observedAt: input.observedAt
    })),
    upsertEvent: vi.fn(async (input) => {
      const key = `${input.chainId}:${input.transactionHash}:${input.logIndex}`;
      if (!events.has(key)) {
        events.set(key, { id: `event-${events.size + 1}`, ...input });
      }
      return events.get(key);
    }),
    createAlert: vi.fn(async (candidate, organizationId, projectId) => {
      if (candidate.evidence.length === 0) return null;
      if (!alerts.has(candidate.idempotencyKey)) {
        alerts.set(candidate.idempotencyKey, {
          id: `alert-${alerts.size + 1}`,
          organizationId,
          projectId,
          ...candidate,
          evidence: candidate.evidence.map((item: any, index: number) => ({ id: `evidence-${index + 1}`, ...item }))
        });
      }
      return alerts.get(candidate.idempotencyKey);
    })
  };
  const provider = {
    getLatestBlockNumber: vi.fn(async () => 110n),
    getLogs: vi.fn(async () => logs),
    getTransaction: vi.fn(async (hash: string) => ({
      hash,
      blockNumber: 105n,
      blockHash: "0xblock",
      from: "0x0000000000000000000000000000000000000002",
      to: "0x0000000000000000000000000000000000000001",
      input: "0x",
      value: 0n
    })),
    getBlockTransactions: vi.fn(async () => []),
    getStorageAt: vi.fn(async () => "0x")
  };
  const artifactStore = {
    writeJsonArtifact: vi.fn(async (_prefix: string, relativePath: string) => ({
      artifactKey: relativePath,
      checksum: `checksum-${relativePath}`,
      sizeBytes: 10
    }))
  };
  return {
    repository,
    provider,
    events,
    alerts,
    service: new MonitoringService(
      repository as any,
      artifactStore as any,
      new MonitorRuleEngine(),
      { deliverForAlerts: vi.fn(async () => {}) } as any,
      { assertAndConsume: vi.fn(async () => {}) } as any,
      () => provider as any
    )
  };
}

function target() {
  return {
    id: "target-1",
    organizationId: "org-1",
    projectId: "project-1",
    scanId: "scan-1",
    chainId: 1,
    address: "0x0000000000000000000000000000000000000001",
    normalizedAddress: "0x0000000000000000000000000000000000000001",
    kind: "PROXY" as const,
    providerName: "test-rpc"
  };
}

function rule(kind: string) {
  return {
    id: `rule-${kind}`,
    kind,
    severity: "HIGH",
    eventSignature: null,
    functionSelector: null,
    threshold: null,
    config: null
  };
}

function log(topic: string, transactionHash: string, logIndex: number) {
  return {
    address: "0x0000000000000000000000000000000000000001",
    blockNumber: 105n,
    blockHash: "0xblock",
    transactionHash,
    logIndex,
    topics: [topic],
    data: "0x"
  };
}
