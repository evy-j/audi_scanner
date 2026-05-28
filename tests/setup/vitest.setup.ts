import { afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

process.env.NODE_ENV ??= "test";
process.env.LOG_LEVEL ??= "silent";
process.env.DATABASE_URL ??= "postgresql://audit_scanner:audit_scanner@localhost:5432/audit_scanner_test?schema=public";
process.env.REDIS_URL ??= "redis://localhost:6379/15";
process.env.REDIS_KEY_PREFIX ??= "audit-scanner:test";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-change-me-32chars";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-change-me-32chars";
process.env.API_KEY_HASH_SECRET ??= "test-api-key-secret-change-me-32chars";
process.env.SCANNER_ARTIFACT_ROOT ??= ".artifacts-test";
process.env.SCANNER_TEMP_ROOT ??= ".scanner-tmp-test";
process.env.SCANNER_DOCKER_BINARY ??= "docker";
process.env.SCANNER_DOCKER_PULL_POLICY ??= "never";

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
