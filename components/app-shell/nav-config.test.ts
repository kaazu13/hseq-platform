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

  describe("matchSegment (project-scoped items whose real URL isn't the item's own href)", () => {
    const scaffoldRegisterItem: NavItem = {
      label: "Scaffold Register",
      href: "/scaffolds",
      icon: baseItem.icon,
      status: "available",
      description: "",
      buildHref: ({ companyId, projectId }) => `/companies/${companyId}/projects/${projectId}/scaffolds`,
      matchSegment: "scaffolds",
    };
    const scaffoldInspectionsItem: NavItem = { ...scaffoldRegisterItem, label: "Scaffold Inspections", href: "/scaffolds/inspections", matchSegment: "scaffold-inspections" };
    const teamsItem: NavItem = { ...scaffoldRegisterItem, label: "Teams", href: "/teams", matchSegment: "teams" };

    it("matches the real, company/project-scoped URL even though it differs from the item's own href", () => {
      expect(isNavItemActive(scaffoldRegisterItem, "/companies/c1/projects/p1/scaffolds", new URLSearchParams())).toBe(true);
      expect(isNavItemActive(scaffoldRegisterItem, "/companies/c1/projects/p1/scaffolds/abc-123", new URLSearchParams())).toBe(true);
    });

    it("does not match a sibling segment under the same company/project prefix", () => {
      expect(isNavItemActive(scaffoldRegisterItem, "/companies/c1/projects/p1/scaffold-inspections", new URLSearchParams())).toBe(false);
      expect(isNavItemActive(scaffoldInspectionsItem, "/companies/c1/projects/p1/scaffolds", new URLSearchParams())).toBe(false);
      expect(isNavItemActive(teamsItem, "/companies/c1/projects/p1/scaffolds", new URLSearchParams())).toBe(false);
    });

    it("does not match outside the /companies/:id/projects/:id/ prefix, regardless of a matching trailing segment", () => {
      expect(isNavItemActive(scaffoldRegisterItem, "/scaffolds", new URLSearchParams())).toBe(false);
    });

    it("never falls back to the item's own href for matching once matchSegment is set", () => {
      // Even a literal, exact match against `item.href` must not count —
      // matchSegment items are only ever active via the real URL shape.
      expect(isNavItemActive(scaffoldRegisterItem, scaffoldRegisterItem.href, new URLSearchParams())).toBe(false);
    });
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

  it("has no 'Scaffold Defects' entry — removed from the nav, functionality stays embedded in inspections", () => {
    expect(ALL_NAV_ITEMS.some((item) => item.label === "Scaffold Defects")).toBe(false);
  });

  it("groups Today's Teams, Worked Hours, Scaffold Register, Scaffold Inspections, and LMRA under 'Planning & Daily'", () => {
    const group = NAV_GROUPS.find((g) => g.label === "Planning & Daily");
    expect(group).toBeDefined();
    const labels = group!.items.map((item) => item.label);
    expect(labels).toEqual(expect.arrayContaining(["Today's Teams", "Worked Hours", "Scaffold Register", "Scaffold Inspections", "LMRA"]));
  });

  it("groups Toolbox Meetings, Toolbox Templates, Safety Flash, Safety Observations, and Corrective Actions under 'Safety Management'", () => {
    const group = NAV_GROUPS.find((g) => g.label === "Safety Management");
    expect(group).toBeDefined();
    const labels = group!.items.map((item) => item.label);
    expect(labels).toEqual(expect.arrayContaining(["Toolbox Meetings", "Toolbox Templates", "Safety Flash", "Safety Observations", "Corrective Actions"]));
  });

  it("Scaffold Register, Scaffold Inspections, Today's Teams, and Worked Hours are project-scoped (buildHref + matchSegment), not fixed hrefs", () => {
    for (const label of ["Scaffold Register", "Scaffold Inspections", "Today's Teams", "Worked Hours"]) {
      const item = ALL_NAV_ITEMS.find((i) => i.label === label)!;
      expect(item).toBeDefined();
      expect(item.buildHref).toBeTypeOf("function");
      expect(item.matchSegment).toBeTruthy();
      expect(item.buildHref!({ companyId: "c1", projectId: "p1" })).toMatch(/^\/companies\/c1\/projects\/p1\//);
    }
  });

  it("Scaffold Inspections is available now that its real page exists (no longer a placeholder)", () => {
    const item = ALL_NAV_ITEMS.find((i) => i.label === "Scaffold Inspections")!;
    expect(item.status).toBe("available");
  });
});
