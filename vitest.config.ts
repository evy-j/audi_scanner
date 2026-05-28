import path from "node:path";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;

export default defineConfig({
  oxc: false,
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react"
  },
  resolve: {
    alias: {
      "@audit-scanner/database": path.resolve(root, "packages/database/src/index.ts"),
      "@audit-scanner/database/": `${path.resolve(root, "packages/database/src")}/`,
      "@audit-scanner/analysis-ir": path.resolve(root, "packages/analysis-ir/src/index.ts"),
      "@audit-scanner/analysis-ir/": `${path.resolve(root, "packages/analysis-ir/src")}/`,
      "@audit-scanner/scanner-core": path.resolve(root, "packages/scanner-core/src/index.ts"),
      "@audit-scanner/scanner-core/": `${path.resolve(root, "packages/scanner-core/src")}/`,
      "@audit-scanner/shared/": `${path.resolve(root, "packages/shared/src")}/`,
      "@/": `${path.resolve(root, "apps/web/src")}/`,
      "@web/": `${path.resolve(root, "apps/web/src")}/`,
      "@api/": `${path.resolve(root, "apps/api/src")}/`,
      "@worker/": `${path.resolve(root, "apps/worker/src")}/`
    }
  },
  test: {
    globals: true,
    environment: "node",
    globalSetup: ["tests/setup/global.setup.ts"],
    setupFiles: ["tests/setup/vitest.setup.ts"],
    include: [
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/api/**/*.test.ts",
      "tests/worker/**/*.test.ts",
      "tests/scanner/**/*.test.ts",
      "tests/security/**/*.test.ts",
      "tests/prisma/**/*.test.ts",
      "tests/frontend/**/*.test.ts",
      "tests/frontend/**/*.test.tsx",
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
      "packages/**/*.test.ts"
    ],
    exclude: [
      "node_modules",
      "dist",
      "coverage",
      ".next",
      "tests/e2e/**",
      "tests/load/**",
      "tests/fixtures/**"
    ],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage/vitest",
      reporter: ["text", "json-summary", "lcov"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "coverage/**",
        "tests/**",
        "**/*.config.ts",
        "**/*.d.ts",
        "apps/worker/src/examples/**"
      ],
      thresholds: {
        branches: 80,
        functions: 85,
        lines: 85,
        statements: 85
      }
    }
  }
});
