import { defineConfig } from "vitest/config";

/**
 * Database/RLS test config — pure SQL-level tests against a REAL local
 * Supabase Postgres instance (`supabase start`), using the same
 * `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = ...`
 * impersonation technique proven manually throughout the engineering
 * review. Never touches application code, Next.js, or Server Actions —
 * see vitest.integration.config.ts for that layer.
 *
 * tests/db/helpers.ts refuses to connect to anything but a loopback host,
 * as a hard guard against ever accidentally running these against the
 * remote/hosted project.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    setupFiles: ["tests/env.ts"],
    fileParallelism: false,
    testTimeout: 30000,
  },
});
