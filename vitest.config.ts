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
    // Milestone G, item 11: `*.dom.test.tsx` files opt into jsdom via a
    // `// @vitest-environment jsdom` docblock (their first line) for real
    // interaction tests (React Testing Library) — everything else (the
    // vast majority: pure functions, schemas, DB invariants excluded
    // below) stays on the fast, dependency-free "node" environment.
    environment: "node",
    include: ["**/*.test.ts", "**/*.dom.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "tests/db/**", "tests/integration/**"],
  },
});
