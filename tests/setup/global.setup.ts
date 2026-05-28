import { mkdir, rm } from "node:fs/promises";

export async function setup(): Promise<void> {
  assertNonProductionTestEnvironment();

  await Promise.all([
    mkdir(process.env.SCANNER_ARTIFACT_ROOT ?? ".artifacts-test", { recursive: true }),
    mkdir(process.env.SCANNER_TEMP_ROOT ?? ".scanner-tmp-test", { recursive: true })
  ]);
}

export async function teardown(): Promise<void> {
  if (process.env.TEST_KEEP_ARTIFACTS === "true") {
    return;
  }

  await Promise.allSettled([
    rm(process.env.SCANNER_ARTIFACT_ROOT ?? ".artifacts-test", {
      recursive: true,
      force: true
    }),
    rm(process.env.SCANNER_TEMP_ROOT ?? ".scanner-tmp-test", {
      recursive: true,
      force: true
    })
  ]);
}

function assertNonProductionTestEnvironment(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run tests with NODE_ENV=production");
  }

  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (/supabase|render|production|prod/iu.test(databaseUrl)) {
    throw new Error("Refusing to run tests against a production-like DATABASE_URL");
  }
}
