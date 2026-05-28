import { createRequire } from "node:module";
import { env } from "../../config/environment.js";

const require = createRequire(import.meta.url);
const packageJson = require("../../../package.json") as { version?: string };

export function versionMetadata() {
  return {
    appVersion: packageJson.version ?? "0.0.0",
    gitCommit: process.env.GIT_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.RENDER_GIT_COMMIT ?? "unknown",
    buildTimestamp: process.env.BUILD_TIMESTAMP ?? process.env.VERCEL_GIT_COMMIT_SHA_CREATED_AT ?? new Date(0).toISOString(),
    environmentName: env.NODE_ENV,
    apiVersion: "v1"
  };
}
