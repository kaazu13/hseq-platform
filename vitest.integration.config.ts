import { defineConfig } from "vitest/config";

/**
 * Integration test config — Server Actions exercised against a REAL local
 * Supabase instance (`supabase start`). Never points at the remote/hosted
 * project — see tests/integration/setup.ts, which throws immediately if
 * SUPABASE_URL isn't a loopback address, as a hard guard against ever
 * accidentally running these against the live database.
 *
 * Run sequentially (no parallel test files) — every test shares one local
 * Postgres instance and creates/tears down its own disposable
 * company per test, so cross-file parallelism isn't worth the
 * isolation risk at this test count.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    setupFiles: ["tests/env.ts", "tests/integration/setup.ts"],
    fileParallelism: false,
    testTimeout: 30000,
  },
});
