import { performance } from "node:perf_hooks";

const target = trimTrailingSlash(process.env.LOAD_TEST_TARGET ?? "http://localhost:4000");
const path = process.env.LOAD_TEST_PATH ?? "/health";
const virtualUsers = Number(process.env.LOAD_TEST_VUS ?? 25);
const durationSeconds = Number(process.env.LOAD_TEST_DURATION_SECONDS ?? 60);
const maxErrorRate = Number(process.env.LOAD_TEST_MAX_ERROR_RATE ?? 0.01);
const p95ThresholdMs = Number(process.env.LOAD_TEST_P95_MS ?? 500);
const url = `${target}${path.startsWith("/") ? path : `/${path}`}`;
const deadline = Date.now() + durationSeconds * 1000;
const samples = [];

await Promise.all(
  Array.from({ length: virtualUsers }, (_, index) => runVirtualUser(index + 1))
);

const durations = samples.map((sample) => sample.durationMs).sort((left, right) => left - right);
const failures = samples.filter((sample) => !sample.ok);
const summary = {
  suite: "load",
  target: url,
  virtualUsers,
  durationSeconds,
  requests: samples.length,
  failures: failures.length,
  errorRate: samples.length === 0 ? 1 : failures.length / samples.length,
  p50Ms: percentile(durations, 50),
  p95Ms: percentile(durations, 95),
  p99Ms: percentile(durations, 99)
};

console.log(JSON.stringify(summary, null, 2));

if (summary.errorRate > maxErrorRate) {
  throw new Error(`Load test error rate ${summary.errorRate} exceeded ${maxErrorRate}`);
}

if (summary.p95Ms > p95ThresholdMs) {
  throw new Error(`Load test p95 ${summary.p95Ms}ms exceeded ${p95ThresholdMs}ms`);
}

async function runVirtualUser(userNumber) {
  while (Date.now() < deadline) {
    const startedAt = performance.now();
    try {
      const response = await fetch(url, {
        headers: {
          "x-test-suite": "load",
          "x-virtual-user": userNumber.toString()
        },
        signal: AbortSignal.timeout(10_000)
      });
      const durationMs = performance.now() - startedAt;
      samples.push({
        ok: response.ok,
        status: response.status,
        durationMs
      });
    } catch (error) {
      samples.push({
        ok: false,
        status: 0,
        durationMs: performance.now() - startedAt,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    await sleep(100);
  }
}

function percentile(values, percentileValue) {
  if (values.length === 0) {
    return 0;
  }
  const index = Math.min(values.length - 1, Math.ceil((percentileValue / 100) * values.length) - 1);
  return Number(values[index].toFixed(2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
