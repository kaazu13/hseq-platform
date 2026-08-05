import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Regression test for the Server/Client boundary bug this milestone fixed:
 * a Server Component imported `toEmployeeOptions()` (a plain function)
 * from components/shared/employee-combobox.tsx, which is marked
 * `"use client"` — invalid in the App Router, since importing ANY export
 * from a `"use client"` module makes the whole module a client reference.
 * `toEmployeeOptions`/`EmployeeOption` now live in
 * modules/employees/employee-options.ts (no `"use client"` directive), so
 * Server Components have a safe import target and this file only ever
 * needs to be imported by other Client Components.
 *
 * This walks the real source tree (not a fixture) so it catches every
 * future accidental re-introduction, not just the two originally
 * reported pages.
 */

const ROOT = join(__dirname, "..", "..");
const SCAN_DIRS = ["app", "modules", "components"];
const SKIP_DIR_NAMES = new Set(["node_modules", ".next", ".git"]);
const CLIENT_MODULE_IMPORT_PATH = "@/components/shared/employee-combobox";
const CLIENT_MODULE_FILE = join("components", "shared", "employee-combobox.tsx");

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".test.tsx")) {
      files.push(full);
    }
  }
  return files;
}

function isClientFile(source: string): boolean {
  // A directive must be the first statement in the file (ignoring leading
  // blank lines/comments isn't required by the spec, but tolerate a BOM).
  const firstStatement = source.replace(/^﻿/, "").trimStart().slice(0, 20);
  return firstStatement.startsWith('"use client"') || firstStatement.startsWith("'use client'");
}

function findOffenders(): string[] {
  const allFiles = SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir)));
  const offenders: string[] = [];
  for (const file of allFiles) {
    const relPath = relative(ROOT, file);
    if (relPath === CLIENT_MODULE_FILE) continue; // the module itself may reference its own type re-export

    const source = readFileSync(file, "utf8");
    if (!source.includes(CLIENT_MODULE_IMPORT_PATH)) continue;
    if (isClientFile(source)) continue; // Client Components are allowed to import the client component

    offenders.push(relPath);
  }
  return offenders;
}

describe("Server Components never import the client-only EmployeeCombobox module for pure utilities", () => {
  it("scans a non-empty source tree", () => {
    const allFiles = SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir)));
    expect(allFiles.length).toBeGreaterThan(0);
  });

  it("finds no Server Component/module importing components/shared/employee-combobox", () => {
    expect(findOffenders()).toEqual([]);
  });
});

describe("modules/employees/employee-options.ts stays server/client-neutral", () => {
  it("has no \"use client\" directive", () => {
    const source = readFileSync(join(ROOT, "modules", "employees", "employee-options.ts"), "utf8");
    expect(isClientFile(source)).toBe(false);
  });

  it("imports no React hooks or browser APIs", () => {
    const source = readFileSync(join(ROOT, "modules", "employees", "employee-options.ts"), "utf8");
    expect(source).not.toMatch(/from ["']react["']/);
    expect(source).not.toMatch(/\bwindow\.|:\s*Window\b/);
    expect(source).not.toMatch(/\bdocument\./);
  });
});
