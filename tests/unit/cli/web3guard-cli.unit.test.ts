import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { buildSarif } from "../../../cli/web3guard_cli/sarif.mjs";
import { run } from "../../../cli/web3guard_cli/main.mjs";
import { buildSourceBundle } from "../../../cli/web3guard_cli/source.mjs";

describe("P12 Web3Guard CLI", () => {
  it("returns configuration error when backend settings are missing", async () => {
    const output: string[] = [];
    const code = await run(["auth", "status"], {}, {
      log: (value: string) => output.push(value),
      error: (value: string) => output.push(value)
    });

    expect(code).toBe(2);
    expect(output.join("\n")).toContain("WEB3GUARD_API_URL");
  });

  it("builds valid minimal SARIF without fabricated locations", () => {
    const sarif = buildSarif({
      findings: [{
        id: "finding-1",
        title: "Unchecked call",
        severity: "HIGH",
        fingerprint: "abc123"
      }]
    });

    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0].tool.driver.name).toBe("Web3Guard");
    expect(sarif.runs[0].results[0]).not.toHaveProperty("locations");
  });

  it("builds a sanitized archive that excludes .env, node_modules, and .web3guardignore paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "web3guard-cli-"));
    try {
      await mkdir(path.join(root, "contracts"), { recursive: true });
      await mkdir(path.join(root, "node_modules", "dep"), { recursive: true });
      await mkdir(path.join(root, "ignored"), { recursive: true });
      await writeFile(path.join(root, ".env"), "PRIVATE_KEY=abc", "utf8");
      await writeFile(path.join(root, ".web3guardignore"), "ignored/\n", "utf8");
      await writeFile(path.join(root, "node_modules", "dep", "index.js"), "module.exports = {}", "utf8");
      await writeFile(path.join(root, "ignored", "Drop.sol"), "pragma solidity ^0.8.20; contract Drop {}", "utf8");
      await writeFile(path.join(root, "contracts", "Keep.sol"), "pragma solidity ^0.8.20; contract Keep {}", "utf8");

      const bundle = await buildSourceBundle(root);
      expect(bundle.files.map((file) => file.path)).toContain("contracts/Keep.sol");
      expect(bundle.files.map((file) => file.path)).not.toContain(".env");
      expect(bundle.ignored.map((file) => file.path)).toContain("node_modules");
      expect(bundle.ignored.map((file) => file.path)).toContain("ignored");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
