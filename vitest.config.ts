import { defineConfig } from "vitest/config";

/**
 * Unit test config — pure functions only, no database, no Next.js request
 * context. Deliberately excludes tests/integration/** (see
 * vitest.integration.config.ts) so `npm run test:unit` never needs a local
 * Supabase instance and is always safe to run, anywhere, with no setup.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "tests/db/**", "tests/integration/**"],
  },
});
