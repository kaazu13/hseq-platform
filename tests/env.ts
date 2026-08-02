import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Loads .env.test.local manually (same technique already used by
 * scripts/seed-test-org.ts) rather than relying on Vite/Vitest's implicit
 * .env-file mode conventions, which this repo doesn't otherwise depend on
 * anywhere and isn't worth introducing a new implicit-behavior dependency
 * on for two test config files. Never overwrites an already-set env var
 * (e.g. one exported directly in CI).
 */
export function loadTestEnv() {
  const path = resolve(__dirname, "..", ".env.test.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadTestEnv();
