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

  it("milestone F item 6: the personal dashboard is labeled 'Your Dashboard', not the generic 'Dashboard'", () => {
    expect(ALL_NAV_ITEMS.some((item) => item.label === "Dashboard")).toBe(false);
    const item = ALL_NAV_ITEMS.find((item) => item.href === "/dashboard")!;
    expect(item).toBeDefined();
    expect(item.label).toBe("Your Dashboard");
  });

  it("milestone F item 7: a 'Project Dashboard' nav item resolves to the canonical company/project-scoped route", () => {
    const item = ALL_NAV_ITEMS.find((i) => i.label === "Project Dashboard")!;
    expect(item).toBeDefined();
    expect(item.buildHref).toBeTypeOf("function");
    expect(item.buildHref!({ companyId: "c1", projectId: "p1" })).toBe("/companies/c1/projects/p1");
  });
});

describe("Navigation redesign item 4: the redundant 'Projects' operational nav entry is gone", () => {
  it("no 'Projects' nav item exists anywhere — project administration is reached via Project Dashboard's 'Manage project' link, not a competing sidebar entry", () => {
    const projectsItems = ALL_NAV_ITEMS.filter((item) => item.label === "Projects");
    expect(projectsItems).toHaveLength(0);
  });

  it("no empty 'Projects' nav group remains once its only items (Projects, Equipment) were removed/relocated", () => {
    expect(NAV_GROUPS.some((group) => group.label === "Projects")).toBe(false);
  });
});

describe("Navigation redesign item 5: Equipment moved under 'Planning & Daily'", () => {
  it("Equipment is grouped under Planning & Daily, alongside Today's Teams/Worked Hours/Scaffold Register/Scaffold Inspections/LMRA", () => {
    const group = NAV_GROUPS.find((g) => g.label === "Planning & Daily");
    expect(group).toBeDefined();
    expect(group!.items.map((item) => item.label)).toEqual(
      expect.arrayContaining(["Today's Teams", "Worked Hours", "Equipment", "Scaffold Register", "Scaffold Inspections", "LMRA"]),
    );
  });

  it("Equipment no longer lives in any other group", () => {
    const groupsWithEquipment = NAV_GROUPS.filter((group) => group.items.some((item) => item.label === "Equipment"));
    expect(groupsWithEquipment).toHaveLength(1);
    expect(groupsWithEquipment[0].label).toBe("Planning & Daily");
  });
});

describe("exact: true — a plain-href item whose route is a prefix of sibling routes (Platform Admin 'Overview')", () => {
  const overviewItem: NavItem = { ...baseItem, label: "Overview", href: "/platform-admin", matchQueryParam: undefined, exact: true };
  const companiesItem: NavItem = { ...baseItem, label: "Companies", href: "/platform-admin/companies", matchQueryParam: undefined };

  it("Overview matches only its own exact path, never a sibling sub-page", () => {
    expect(isNavItemActive(overviewItem, "/platform-admin", new URLSearchParams())).toBe(true);
    expect(isNavItemActive(overviewItem, "/platform-admin/companies", new URLSearchParams())).toBe(false);
    expect(isNavItemActive(overviewItem, "/platform-admin/companies/abc-123", new URLSearchParams())).toBe(false);
  });

  it("the sibling sub-page still matches itself and its own children (default startsWith behavior, unaffected by Overview's exact flag)", () => {
    expect(isNavItemActive(companiesItem, "/platform-admin/companies", new URLSearchParams())).toBe(true);
    expect(isNavItemActive(companiesItem, "/platform-admin/companies/abc-123", new URLSearchParams())).toBe(true);
    expect(isNavItemActive(companiesItem, "/platform-admin", new URLSearchParams())).toBe(false);
  });

  it("real defect this fix corrects: without `exact`, Overview's plain href would ALSO match every sibling sub-page since they all start with '/platform-admin/'", () => {
    const overviewWithoutExact: NavItem = { ...overviewItem, exact: undefined };
    expect(isNavItemActive(overviewWithoutExact, "/platform-admin/companies", new URLSearchParams())).toBe(true);
  });
});

describe("Platform Administration nav group (Part 2 of the post-audit implementation package)", () => {
  it("groups Overview, Companies, Users, Roles & Permissions, Security, Audit Log, Usage & Billing, and Platform Settings together, all platform_super_admin-only", () => {
    const group = NAV_GROUPS.find((g) => g.label === "Platform Administration");
    expect(group).toBeDefined();
    const labels = group!.items.map((item) => item.label);
    expect(labels).toEqual(
      expect.arrayContaining(["Overview", "Companies", "Users", "Roles & Permissions", "Security", "Audit Log", "Usage & Billing", "Platform Settings"]),
    );
    for (const item of group!.items) {
      expect(item.roles).toEqual(["platform_super_admin"]);
    }
  });
});

describe("matchSegment: '' (project root — 'Project Dashboard')", () => {
  const projectDashboardItem: NavItem = {
    label: "Project Dashboard",
    href: "/project-dashboard",
    icon: baseItem.icon,
    status: "available",
    description: "",
    buildHref: ({ companyId, projectId }) => `/companies/${companyId}/projects/${projectId}`,
    matchSegment: "",
  };

  it("matches the bare project root", () => {
    expect(isNavItemActive(projectDashboardItem, "/companies/c1/projects/p1", new URLSearchParams())).toBe(true);
  });

  it("does not match a sub-page under the same project", () => {
    expect(isNavItemActive(projectDashboardItem, "/companies/c1/projects/p1/teams", new URLSearchParams())).toBe(false);
  });
});

describe("Employee-role correction: management/aggregate nav items are hidden from Employee", () => {
  const EMPLOYEE_HIDDEN_LABELS = [
    "Project Dashboard",
    "Safety Overview",
    "Employees",
    "Equipment",
    "Scaffold Register",
    "Scaffold Inspections",
    "Toolbox Templates",
    "Safety Walks",
    "Incidents and Near Misses",
    "Documents",
    "Reports",
    "Certificates",
  ];

  it.each(EMPLOYEE_HIDDEN_LABELS)("'%s' has a roles array that excludes 'employee'", (label) => {
    const item = ALL_NAV_ITEMS.find((i) => i.label === label)!;
    expect(item).toBeDefined();
    expect(item.roles).toBeDefined();
    expect(item.roles).not.toContain("employee");
  });

  it("Employee still has no roles array (visible) on LMRA, Toolbox Meetings, Safety Flash, Safety Observations, Today's Teams, Worked Hours", () => {
    for (const label of ["LMRA", "Toolbox Meetings", "Safety Observations", "Today's Teams", "Worked Hours"]) {
      const item = ALL_NAV_ITEMS.find((i) => i.label === label)!;
      expect(item).toBeDefined();
      expect(item.roles).toBeUndefined();
    }
  });

  it("'My Equipment' exists, is visible to every role (no roles restriction), and is a flat non-project-scoped route", () => {
    const item = ALL_NAV_ITEMS.find((i) => i.label === "My Equipment")!;
    expect(item).toBeDefined();
    expect(item.href).toBe("/my-equipment");
    expect(item.roles).toBeUndefined();
    expect(item.buildHref).toBeUndefined();
  });

  it("Account and Settings are no longer separate sidebar nav items (already reachable from the profile dropdown)", () => {
    expect(ALL_NAV_ITEMS.some((item) => item.label === "Account")).toBe(false);
    expect(ALL_NAV_ITEMS.some((item) => item.label === "Settings")).toBe(false);
  });

  it("'People and Administration' has no items visible to a plain employee — only Members/Company Setup remain, both company-admin-gated", () => {
    const group = NAV_GROUPS.find((g) => g.label === "People and Administration")!;
    expect(group).toBeDefined();
    for (const item of group.items) {
      expect(item.roles).toBeDefined();
      expect(item.roles).not.toContain("employee");
    }
  });
});
