import { describe, it, expect } from "vitest";
import { isNavItemActive, NAV_GROUPS, ALL_NAV_ITEMS, type NavItem } from "./nav-config";

const baseItem: NavItem = {
  label: "Toolbox Meetings",
  href: "/toolbox-meetings",
  icon: (() => null) as unknown as NavItem["icon"],
  status: "available",
  description: "",
  matchQueryParam: { key: "section", value: null },
};

const templatesItem: NavItem = { ...baseItem, label: "Toolbox Templates", href: "/toolbox-meetings?section=templates", matchQueryParam: { key: "section", value: "templates" } };

describe("isNavItemActive", () => {
  it("matches a plain route with no query param requirement", () => {
    const item: NavItem = { ...baseItem, matchQueryParam: undefined };
    expect(isNavItemActive(item, "/dashboard", new URLSearchParams())).toBe(false);
    expect(isNavItemActive({ ...item, href: "/dashboard" }, "/dashboard", new URLSearchParams())).toBe(true);
  });

  it("matches a nested sub-route via startsWith", () => {
    const item: NavItem = { ...baseItem, href: "/scaffolds", matchQueryParam: undefined };
    expect(isNavItemActive(item, "/scaffolds/abc-123", new URLSearchParams())).toBe(true);
    expect(isNavItemActive(item, "/scaffolds", new URLSearchParams())).toBe(true);
  });

  it("does not match an unrelated route", () => {
    const item: NavItem = { ...baseItem, href: "/scaffolds", matchQueryParam: undefined };
    expect(isNavItemActive(item, "/scaffolding-something-else", new URLSearchParams())).toBe(false);
  });

  it("distinguishes sibling query-param sections sharing one route — the exact Toolbox Meetings/Templates/Safety Flash case", () => {
    const noSection = new URLSearchParams();
    const templatesSection = new URLSearchParams("section=templates");

    expect(isNavItemActive(baseItem, "/toolbox-meetings", noSection)).toBe(true);
    expect(isNavItemActive(templatesItem, "/toolbox-meetings", noSection)).toBe(false);

    expect(isNavItemActive(baseItem, "/toolbox-meetings", templatesSection)).toBe(false);
    expect(isNavItemActive(templatesItem, "/toolbox-meetings", templatesSection)).toBe(true);
  });

  it("never matches when the pathname differs, regardless of query params", () => {
    expect(isNavItemActive(templatesItem, "/dashboard", new URLSearchParams("section=templates"))).toBe(false);
  });
});

describe("NAV_GROUPS structure", () => {
  it("every item has a non-empty label, href, and description", () => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(item.label.length).toBeGreaterThan(0);
        expect(item.href.length).toBeGreaterThan(0);
        expect(item.description.length).toBeGreaterThan(0);
      }
    }
  });

  it("every href appears exactly once as a distinct destination in ALL_NAV_ITEMS", () => {
    const hrefs = ALL_NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("every group has at least one item", () => {
    for (const group of NAV_GROUPS) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });
});
