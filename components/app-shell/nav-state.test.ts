import { describe, it, expect } from "vitest";
import { parseCollapsedGroups, serializeCollapsedGroups, isGroupOpen } from "./nav-state";

describe("parseCollapsedGroups", () => {
  it("returns an empty set for null/missing storage (fully expanded by default)", () => {
    expect(parseCollapsedGroups(null).size).toBe(0);
  });

  it("parses a valid JSON array of labels", () => {
    const result = parseCollapsedGroups(JSON.stringify(["Scaffolding", "Records"]));
    expect(result.has("Scaffolding")).toBe(true);
    expect(result.has("Records")).toBe(true);
    expect(result.size).toBe(2);
  });

  it("never throws on malformed JSON — falls back to fully expanded", () => {
    expect(parseCollapsedGroups("{not valid json").size).toBe(0);
  });

  it("ignores non-string entries in a tampered/malformed array", () => {
    const result = parseCollapsedGroups(JSON.stringify(["Scaffolding", 42, null, { x: 1 }]));
    expect([...result]).toEqual(["Scaffolding"]);
  });

  it("returns empty for a JSON value that isn't an array", () => {
    expect(parseCollapsedGroups(JSON.stringify({ Scaffolding: true })).size).toBe(0);
  });
});

describe("serializeCollapsedGroups / parseCollapsedGroups round-trip", () => {
  it("round-trips a set of labels through serialize -> parse", () => {
    const original = new Set(["Overview", "Scaffolding"]);
    const parsed = parseCollapsedGroups(serializeCollapsedGroups(original));
    expect(parsed).toEqual(original);
  });
});

describe("isGroupOpen", () => {
  it("a group containing the active route is always open, even if stored as collapsed", () => {
    const collapsed = new Set(["Scaffolding"]);
    expect(isGroupOpen("Scaffolding", true, collapsed)).toBe(true);
  });

  it("a non-active group not in the collapsed set is open (default expanded)", () => {
    expect(isGroupOpen("Overview", false, new Set())).toBe(true);
  });

  it("a non-active group the user explicitly collapsed stays closed", () => {
    const collapsed = new Set(["Records"]);
    expect(isGroupOpen("Records", false, collapsed)).toBe(false);
  });
});
