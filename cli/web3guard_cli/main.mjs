#!/usr/bin/env node
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Web3GuardClient } from "./client.mjs";
import { loadConfig, redact, requireBackendConfig } from "./config.mjs";
import { convertReport } from "./report.mjs";
import { buildSarif } from "./sarif.mjs";
import { buildSourceBundle } from "./source.mjs";

const EXIT_POLICY_FAILURE = 1;
const EXIT_CONFIG = 2;
const EXIT_EXECUTION = 3;

export async function run(argv = process.argv.slice(2), env = process.env, io = console) {
  const config = loadConfig(env);
  const client = new Web3GuardClient(config);
  const [command, subcommand, ...rest] = argv;

  try {
    if (command === "auth" && subcommand === "status") {
      const status = await client.authStatus();
      io.log(JSON.stringify({ ok: true, status }, null, 2));
      return 0;
    }

    if (command === "scan" && subcommand === "path") {
      const targetPath = rest[0] && !rest[0].startsWith("--") ? rest[0] : ".";
      const options = parseOptions(rest[0]?.startsWith("--") ? rest : rest.slice(1));
      requireBackendConfig(config);
      const result = await runPathScan(config, client, targetPath, options);
      await writeRequestedOutput(result, options);
      io.log(JSON.stringify({ ok: true, source: "cli", status: result.status, scanId: result.scan?.id ?? null, sourceArtifactId: result.sourceArtifact?.id ?? null }, null, 2));
      return exitCodeForResult(result, options.failOn);
    }

    if (command === "scan" && subcommand === "github") {
      const options = parseOptions(rest);
      if (!options.repo) throw optionError("--repo owner/name is required");
      const response = await client.scanGitHubRepository({
        repo: options.repo,
        branch: options.branch,
        commitSha: options.commitSha,
        pullRequestNumber: options.pullRequestNumber ? Number(options.pullRequestNumber) : undefined,
        source: "CLI"
      });
      io.log(JSON.stringify({ ok: true, source: "cli", scan: response }, null, 2));
      return response.status === "MANUAL_SETUP_REQUIRED" ? EXIT_EXECUTION : 0;
    }

    if (command === "report") {
      const options = parseOptions([subcommand, ...rest].filter(Boolean));
      const input = options.input;
      const format = options.format ?? "sarif";
      const output = options.output;
      if (!input) throw optionError("--input report.json is required");
      const converted = await convertReport(input, format, output);
      io.log(JSON.stringify({ ok: true, format, output: output ?? null, report: output ? undefined : converted }, null, 2));
      return 0;
    }

    if (command === "ci") {
      const options = parseOptions([subcommand, ...rest].filter(Boolean));
      const jsonOut = options.jsonOut ?? "web3guard-report.json";
      const sarifOut = options.sarifOut ?? "web3guard.sarif";
      const report = await runCiScan(config, client, options);
      await writeFile(jsonOut, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      let wroteSarif = false;
      if (report.sarif) {
        await writeFile(sarifOut, `${JSON.stringify(report.sarif, null, 2)}\n`, "utf8");
        wroteSarif = true;
      } else {
        await rm(sarifOut, { force: true }).catch(() => undefined);
      }
      io.log(JSON.stringify({ ok: true, jsonOut, sarifOut: wroteSarif ? sarifOut : null, status: report.status }, null, 2));
      return report.policyFailed ? EXIT_POLICY_FAILURE : report.status === "COMPLETED" ? 0 : EXIT_EXECUTION;
    }

    io.error("Usage: web3guard auth status | scan path . [--dry-run] [--format json|sarif|markdown] [--output file] | scan github --repo owner/name | report --input report.json --format sarif | ci --path . --json-out report.json --sarif-out report.sarif");
    return EXIT_CONFIG;
  } catch (error) {
    const code = error?.code === "POLICY_FAILURE"
      ? EXIT_POLICY_FAILURE
      : error?.code === "CONFIGURATION_ERROR" || error?.code === "AUTH_ERROR" || error?.code === "SOURCE_ARTIFACT_REQUIRED" || error?.code === "REPOSITORY_NOT_CONNECTED"
        ? EXIT_CONFIG
        : EXIT_EXECUTION;
    io.error(redact(JSON.stringify({
      ok: false,
      code: error?.code ?? "ERROR",
      providerCode: error?.providerCode,
      message: error instanceof Error ? error.message : String(error)
    })));
    return code;
  }
}

async function runCiScan(config, client, options) {
  requireBackendConfig(config);
  const targetPath = options.path ?? ".";
  const result = await runPathScan(config, client, targetPath, {
    ...options,
    originKind: "CI_UPLOAD",
    title: options.title ?? `CI scan ${process.env.GITHUB_REPOSITORY ?? path.resolve(targetPath)}`,
    commitSha: options.commitSha ?? process.env.GITHUB_SHA,
    branch: options.branch ?? process.env.GITHUB_REF_NAME
  });
  return {
    ...result,
    source: "ci",
    repository: options.repo ?? process.env.GITHUB_REPOSITORY ?? null,
    policyFailed: thresholdFailed(result.findings ?? [], options.failOn ?? "high")
  };
}

async function runPathScan(_config, client, targetPath, options) {
  const bundle = await buildSourceBundle(targetPath, options);
  const base = {
    status: bundle.ok ? "PREPARED" : "SOURCE_REJECTED",
    source: options.originKind === "CI_UPLOAD" ? "ci" : "cli",
    manifest: bundle.manifest,
    policyStatus: bundle.policyStatus,
    findings: [],
    limitations: []
  };
  if (options.dryRun === "true" || options.dryRun === true) {
    return { ...base, status: "DRY_RUN", dryRun: true };
  }
  if (!bundle.ok) {
    return {
      ...base,
      status: "SOURCE_REJECTED",
      limitations: ["No source files remained after ignore and secret filtering."]
    };
  }
  const upload = await client.uploadSourceArtifact({
    originKind: options.originKind ?? "CLI_UPLOAD",
    branch: options.branch,
    commitSha: options.commitSha,
    pullRequestNumber: options.pullRequestNumber ? Number(options.pullRequestNumber) : undefined,
    pathHash: bundle.pathHash,
    include: arrayOption(options.include),
    exclude: arrayOption(options.exclude),
    files: bundle.files
  });
  if (upload.status !== "STORED" || !upload.artifact?.id) {
    return {
      ...base,
      status: upload.status ?? "SOURCE_REJECTED",
      sourceArtifact: upload.artifact ?? null,
      sourceIngestionRunId: upload.runId ?? null,
      limitations: ["Backend source ingestion did not store an artifact."]
    };
  }
  const scan = await client.scanSourceArtifact({
    title: options.title ?? `CLI scan ${path.resolve(targetPath)}`,
    sourceArtifactId: upload.artifact.id
  });
  const completed = await pollScan(client, scan.id, Number(options.timeoutSeconds ?? 600), Number(options.pollIntervalSeconds ?? 5));
  let findings = [];
  let sarif = null;
  if (["COMPLETED", "PARTIAL"].includes(completed.status)) {
    const findingResponse = await client.getScanFindings(completed.id).catch(() => null);
    findings = Array.isArray(findingResponse?.items) ? findingResponse.items : Array.isArray(findingResponse?.findings) ? findingResponse.findings : [];
    sarif = await client.exportScanSarif(completed.id).catch(() => null);
  }
  return {
    status: completed.status,
    source: options.originKind === "CI_UPLOAD" ? "ci" : "cli",
    sourceArtifact: upload.artifact,
    sourceIngestionRunId: upload.runId,
    scan: completed,
    findings,
    sarif,
    manifest: upload.manifest ?? bundle.manifest,
    policyStatus: upload.manifest?.rejectedFileCount > 0 ? "PARTIAL" : bundle.policyStatus,
    policyFailed: thresholdFailed(findings, options.failOn ?? "high"),
    limitations: completed.status === "COMPLETED" ? [] : ["Scan did not complete successfully; no result was fabricated."]
  };
}

async function pollScan(client, scanId, timeoutSeconds, pollIntervalSeconds) {
  const started = Date.now();
  while (Date.now() - started < timeoutSeconds * 1000) {
    const scan = await client.getScan(scanId);
    if (["COMPLETED", "PARTIAL", "FAILED", "CANCELED", "EXPIRED"].includes(scan.status)) return scan;
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, pollIntervalSeconds) * 1000));
  }
  const scan = await client.getScan(scanId);
  return { ...scan, status: scan.status ?? "TIMEOUT" };
}

async function writeRequestedOutput(result, options) {
  if (!options.output) return;
  const format = options.format ?? "json";
  if (format === "json") {
    await writeFile(options.output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    return;
  }
  if (format === "sarif") {
    if (result.sarif) {
      await writeFile(options.output, `${JSON.stringify(result.sarif, null, 2)}\n`, "utf8");
      return;
    }
    throw optionError("SARIF output requires a completed scan with real SARIF results");
  }
  if (format === "markdown") {
    await writeFile(options.output, markdownSummary(result), "utf8");
    return;
  }
  throw optionError("--format must be json, sarif, or markdown");
}

function markdownSummary(result) {
  return [
    `# Web3Guard Scan`,
    ``,
    `Status: ${result.status}`,
    `Source artifact: ${result.sourceArtifact?.id ?? "not stored"}`,
    `Scan: ${result.scan?.id ?? "not created"}`,
    `Findings: ${result.findings?.length ?? 0}`,
    ``
  ].join("\n");
}

function exitCodeForResult(result, failOn) {
  if (result.policyFailed || thresholdFailed(result.findings ?? [], failOn ?? "high")) return EXIT_POLICY_FAILURE;
  if (["COMPLETED", "PARTIAL", "DRY_RUN"].includes(result.status)) return 0;
  if (result.status === "SOURCE_REJECTED") return EXIT_EXECUTION;
  return EXIT_EXECUTION;
}

function thresholdFailed(findings, threshold = "high") {
  const order = { informational: 0, low: 1, medium: 2, high: 3, critical: 4 };
  const minimum = order[String(threshold).toLowerCase()] ?? order.high;
  return findings.some((finding) => {
    const severity = String(finding.severity ?? finding.level ?? "").toLowerCase();
    return (order[severity] ?? -1) >= minimum;
  });
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (!item?.startsWith("--")) continue;
    const key = item.slice(2).replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = "true";
    } else if (options[key]) {
      options[key] = Array.isArray(options[key]) ? [...options[key], next] : [options[key], next];
      index += 1;
    } else {
      options[key] = next;
      index += 1;
    }
  }
  return options;
}

function arrayOption(value) {
  if (!value) return undefined;
  if (Array.isArray(value)) return value;
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function optionError(message) {
  const error = new Error(message);
  error.code = "CONFIGURATION_ERROR";
  return error;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await run();
}
