import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalSourcePreparationService } from "../../apps/worker/src/services/source-preparation/local-source-preparation.service.js";
import { createSourcePrepareJob } from "../factories/scan-jobs.factory.js";

const artifactRoot = path.resolve(process.env.SCANNER_ARTIFACT_ROOT ?? ".artifacts-test");
const tempRoot = path.resolve(process.env.SCANNER_TEMP_ROOT ?? ".scanner-tmp-test");

describe("LocalSourcePreparationService", () => {
  afterEach(async () => {
    await Promise.allSettled([
      fs.rm(artifactRoot, { recursive: true, force: true }),
      fs.rm(tempRoot, { recursive: true, force: true })
    ]);
  });

  it("copies a source artifact into a prepared per-scan workspace", async () => {
    const artifactKey = "source-fixtures/reentrancy";
    await fs.mkdir(path.join(artifactRoot, artifactKey, "contracts"), { recursive: true });
    await fs.writeFile(
      path.join(artifactRoot, artifactKey, "contracts", "ReentrancyBank.sol"),
      "pragma solidity ^0.8.24; contract ReentrancyBank {}",
      "utf8"
    );

    const result = await new LocalSourcePreparationService().prepare(
      createSourcePrepareJob({
        scanId: "00000000-0000-4000-8000-000000000010",
        organizationId: "00000000-0000-4000-8000-000000000020",
        target: {
          type: "SOURCE",
          artifactKey
        }
      })
    );

    const preparedPath = path.join(artifactRoot, result.preparedArtifactKey);
    const preparedFile = await fs.stat(path.join(preparedPath, "contracts", "ReentrancyBank.sol"));
    expect(preparedFile.isFile()).toBe(true);
    expect(result.framework).toBe("unknown");
    expect(result.compilerVersion).toBe("^0.8.24");
  });

  it("refuses source artifacts without Solidity files", async () => {
    const artifactKey = "source-fixtures/empty";
    await fs.mkdir(path.join(artifactRoot, artifactKey), { recursive: true });
    await fs.writeFile(path.join(artifactRoot, artifactKey, "README.md"), "empty", "utf8");

    await expect(
      new LocalSourcePreparationService().prepare(
        createSourcePrepareJob({
          target: {
            type: "SOURCE",
            artifactKey
          }
        })
      )
    ).rejects.toThrow("at least one .sol file");
  });
});
