import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CreditCard,
  Eye,
  FileBadge,
  FileText,
  FolderKanban,
  HardHat,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  MessagesSquare,
  Rocket,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Siren,
  User,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { RoleName } from "@/modules/companies/types";
import { COMPANY_ADMIN_ROLES } from "@/modules/admin/permissions";

/**
 * Single source of truth for the primary navigation — see
 * docs/UI_GUIDELINES.md §4 and docs/ARCHITECTURE.md §4. Every entry here
 * gets a real route (app/(app)/<href>/page.tsx); the sidebar, the
 * breadcrumb trail, and each placeholder "Coming soon" page all read from
 * this same list, so there is exactly one place that defines "what modules
 * exist" and no route this list doesn't account for.
 *
 * `status: "available"` means a real business module lives behind the
 * route. Everything else is `"planned"` — a real route exists (so the link
 * is never broken) but it renders a shared placeholder.
 *
 * Regrouped (Navigation & Scaffold Registration milestone) into topic
 * groups that stay meaningful as modules are added, rather than one flat
 * growing list — see components/app-shell/nav-main.tsx for the
 * collapsible-group rendering this structure now drives.
 */
export type NavStatus = "available" | "planned";

export type NavItem = {
  label: string;
  /**
   * For most items, the real link. For project-scoped items (`buildHref`
   * is set), this is never linked to directly — it exists only as a
   * stable, unique key for ALL_NAV_ITEMS/breadcrumbs.tsx; the actual URL
   * depends on the caller's active company+project and is computed by
   * `buildHref` instead.
   */
  href: string;
  icon: LucideIcon;
  status: NavStatus;
  /** Shown on the item's own "Coming soon" placeholder page. */
  description: string;
  /** Roles allowed to see this item in the sidebar. Omitted = visible to every authenticated user. This is a UI convenience only — the destination page's own server-side check (requireRole/requireAnyRole/RLS) is the real, authoritative gate; see docs/ARCHITECTURE.md §6. */
  roles?: RoleName[];
  /**
   * For routes that use a query-string section switch on one page (e.g.
   * Toolbox Meetings' `?section=`) rather than a distinct path — `value:
   * null` means "active when this param is absent" (the section's
   * default), `value: string` means "active when the param equals this."
   * Without this, every section of the same page would highlight
   * identically since they all share one `pathname`.
   */
  matchQueryParam?: { key: string; value: string | null };
  /**
   * True for a plain-href item whose route is itself a PREFIX of a
   * sibling item's route (e.g. Platform Admin's "Overview" at
   * `/platform-admin`, sibling to `/platform-admin/companies`,
   * `/platform-admin/users`, etc.) — without this, the default
   * startsWith-based sub-page matching (see below) would highlight
   * "Overview" simultaneously with whichever sibling page is actually
   * active, since every sibling path also starts with `/platform-admin/`.
   * Omitted (the default, used by every other plain-href item) keeps the
   * normal "stay highlighted on a child/detail page" behavior — e.g.
   * "Employees" (`/employees`) staying active on `/employees/EMP001`.
   */
  exact?: boolean;
  /**
   * Set for items whose real URL depends on the caller's active company+
   * project (Scaffold Register, Scaffold Inspections, Teams) — nav-main.tsx
   * calls this to build the actual Link href once both are known. When no
   * project is currently selected, nav-main.tsx renders the item disabled
   * rather than linking to a broken/ambiguous URL.
   */
  buildHref?: (ctx: { companyId: string; projectId: string }) => string;
  /**
   * The path segment immediately after `/companies/:companyId/projects/:projectId/`
   * that this item's real route lives under. Required alongside
   * `buildHref` — isNavItemActive can't compare against `href` for these
   * items (it's a stable placeholder key, not the real URL, and the real
   * URL contains two opaque UUID segments a literal prefix match can't
   * see through).
   */
  matchSegment?: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        label: "Your Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        status: "available",
        description: "Your personal daily assignment, hours, observations, notifications, and leave — at a glance.",
      },
      {
        label: "Project Dashboard",
        href: "/project-dashboard",
        icon: FolderKanban,
        status: "available",
        description: "Workforce, Today's Teams, Worked Hours, LMRA activity, Scaffold inspections, Safety Observations, and Corrective Actions for your currently selected project.",
        buildHref: ({ companyId, projectId }) => `/companies/${companyId}/projects/${projectId}`,
        matchSegment: "",
      },
      {
        label: "Safety Overview",
        href: "/safety-overview",
        icon: ShieldAlert,
        status: "available",
        description:
          "LMRA activity, open safety items, and expiring qualifications across your company, filterable by project, work area, date, and status.",
      },
    ],
  },
  {
    label: "Workforce",
    items: [
      {
        label: "Employees",
        href: "/employees",
        icon: Users,
        status: "available",
        description:
          "Company employment records for your company — name, position, employment status, and (once activated) company roles.",
      },
    ],
  },
  {
    label: "Planning & Daily",
    items: [
      {
        label: "Today's Teams",
        href: "/teams",
        icon: Users,
        status: "available",
        description:
          "Date-specific project workforce teams — foreman, workers, shift, work area, and activity, for a specific day. Open during the day, locked at end of day as historical evidence. Scoped to your currently selected project.",
        buildHref: ({ companyId, projectId }) => `/companies/${companyId}/projects/${projectId}/teams`,
        matchSegment: "teams",
      },
      {
        label: "Worked Hours",
        href: "/worked-hours",
        icon: Clock,
        status: "available",
        description: "Credited hours per employee per day — draft/submitted lifecycle, independent of Today's Teams locking. Scoped to your currently selected project.",
        buildHref: ({ companyId, projectId }) => `/companies/${companyId}/projects/${projectId}/worked-hours`,
        matchSegment: "worked-hours",
      },
      {
        label: "Equipment",
        href: "/equipment",
        icon: Wrench,
        status: "available",
        description:
          "Company and project equipment — inventory, issuance, employee requests, returns, and full history. Scoped to your currently selected project.",
        buildHref: ({ companyId, projectId }) => `/companies/${companyId}/projects/${projectId}/equipment`,
        matchSegment: "equipment",
      },
      {
        label: "Scaffold Register",
        href: "/scaffolds",
        icon: HardHat,
        status: "available",
        description:
          "The scaffold register — tag numbers, type, dimensions, load class, responsible Foreman and team, and a complete chronological inspection history. Scoped to your currently selected project.",
        buildHref: ({ companyId, projectId }) => `/companies/${companyId}/projects/${projectId}/scaffolds`,
        matchSegment: "scaffolds",
      },
      {
        label: "Scaffold Inspections",
        href: "/scaffolds/inspections",
        icon: ClipboardList,
        status: "available",
        description:
          "Every scaffold inspection recorded across your currently selected project's scaffolds, in one list — each entry opens the same canonical inspection view reached from the Scaffold Register.",
        buildHref: ({ companyId, projectId }) => `/companies/${companyId}/projects/${projectId}/scaffold-inspections`,
        matchSegment: "scaffold-inspections",
      },
      {
        label: "LMRA",
        href: "/lmra",
        icon: ShieldCheck,
        status: "available",
        description:
          "A short, structured go/no-go risk check completed by a crew immediately before starting a task.",
      },
    ],
  },
  {
    label: "Safety Management",
    items: [
      {
        label: "Toolbox Meetings",
        href: "/toolbox-meetings",
        icon: MessagesSquare,
        status: "available",
        description:
          "A document-based register of completed toolbox meetings — the signed attendance evidence lives inside each uploaded PDF.",
        matchQueryParam: { key: "section", value: null },
      },
      {
        label: "Toolbox Templates",
        href: "/toolbox-meetings?section=templates",
        icon: BookOpen,
        status: "available",
        description: "A reusable, company-wide library of toolbox meeting PDF templates.",
        matchQueryParam: { key: "section", value: "templates" },
      },
      {
        label: "Safety Flash",
        href: "/toolbox-meetings?section=safety-flash",
        icon: Siren,
        status: "available",
        description: "Short, one-page safety bulletins shared company-wide or on a specific project.",
        matchQueryParam: { key: "section", value: "safety-flash" },
      },
      {
        label: "Safety Observations",
        href: "/observations",
        icon: Eye,
        status: "available",
        description:
          "Site safety observations — positive recognition and safety issues (unsafe acts/conditions, PPE, housekeeping, and more), with corrective actions tracked to closure.",
      },
      {
        label: "Corrective Actions",
        href: "/corrective-actions",
        icon: ListChecks,
        status: "planned",
        description:
          "An company-wide register of tracked remediation tasks — today, corrective actions are managed inline within the Safety Observation that raised them.",
      },
      {
        label: "Safety Walks",
        href: "/inspections",
        icon: ClipboardCheck,
        status: "planned",
        description:
          "General safety walks across a project, with checklist results and photo evidence — distinct from Scaffold Inspections, which has its own dedicated module.",
      },
      {
        label: "Incidents and Near Misses",
        href: "/incidents",
        icon: AlertTriangle,
        status: "planned",
        description:
          "Formal records of incidents and near-misses, with severity classification, investigation, and follow-up.",
      },
    ],
  },
  {
    label: "Records",
    items: [
      {
        label: "Documents",
        href: "/documents",
        icon: FileText,
        status: "planned",
        description:
          "General company and project documents, separate from individual employee certificates.",
      },
      {
        label: "Reports",
        href: "/reports",
        icon: BarChart3,
        status: "planned",
        description:
          "Role-scoped dashboards and exports summarizing hours, attendance, safety, and compliance.",
      },
      {
        label: "Certificates",
        href: "/certificates",
        icon: FileBadge,
        status: "planned",
        description:
          "Required documents and certificates per employee, with expiry tracking and renewal reminders.",
      },
    ],
  },
  {
    label: "People and Administration",
    items: [
      {
        label: "Account",
        href: "/account",
        icon: User,
        status: "available",
        description: "Your profile, company, roles, and project assignments.",
      },
      {
        label: "Members",
        href: "/admin/members",
        icon: Users,
        status: "available",
        description: "Company member status, roles, and project assignments.",
        roles: COMPANY_ADMIN_ROLES,
      },
      {
        label: "Company Setup",
        href: "/onboarding",
        icon: Rocket,
        status: "available",
        description: "Onboarding checklist — logo, first project, employees, and invitations for a newly created company.",
        roles: COMPANY_ADMIN_ROLES,
      },
      {
        label: "Settings",
        href: "/settings",
        icon: Settings,
        status: "planned",
        description: "Company settings, membership, and role management.",
      },
    ],
  },
  {
    label: "Platform Administration",
    items: [
      {
        label: "Overview",
        href: "/platform-admin",
        icon: LayoutDashboard,
        status: "available",
        description: "Platform-wide counts — companies, projects, employees, accounts, invitations, warnings, and recent activity.",
        roles: ["platform_super_admin"],
        exact: true,
      },
      {
        label: "Companies",
        href: "/platform-admin/companies",
        icon: Building2,
        status: "available",
        description: "Every company on the platform — status, usage, administrators, invitations, and subscription.",
        roles: ["platform_super_admin"],
      },
      {
        label: "Users",
        href: "/platform-admin/users",
        icon: Users,
        status: "available",
        description: "Search every platform account — status, memberships, roles, security history, and warnings.",
        roles: ["platform_super_admin"],
      },
      {
        label: "Roles & Permissions",
        href: "/platform-admin/roles",
        icon: KeyRound,
        status: "available",
        description: "The 11 built-in system roles (read-only) and each company's custom roles.",
        roles: ["platform_super_admin"],
      },
      {
        label: "Security",
        href: "/platform-admin/security",
        icon: ShieldAlert,
        status: "available",
        description: "Platform-wide login/security history, account status changes, and platform warnings.",
        roles: ["platform_super_admin"],
      },
      {
        label: "Audit Log",
        href: "/platform-admin/audit",
        icon: ScrollText,
        status: "available",
        description: "Every recorded audit event across the platform, filterable by actor, action, entity, company, and date.",
        roles: ["platform_super_admin"],
      },
      {
        label: "Usage & Billing",
        href: "/platform-admin/billing",
        icon: CreditCard,
        status: "available",
        description: "Each company's plan, subscription status, and employee/project usage against its limits. Manual — no automated payment processing.",
        roles: ["platform_super_admin"],
      },
      {
        label: "Platform Settings",
        href: "/platform-admin/settings",
        icon: Settings,
        status: "available",
        description: "The platform super administrator roster — grant or revoke platform-level access.",
        roles: ["platform_super_admin"],
      },
    ],
  },
];

/** Flat list of every nav item — used by the breadcrumb trail and to generate placeholder routes consistently. */
export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/**
 * True if `item` is the active nav item for the given pathname/search
 * params. Shared by nav-main.tsx (group/item highlighting) and
 * breadcrumbs.tsx (trail label) so a query-param-scoped item like
 * "Toolbox Templates" (`?section=templates`) is never conflated with its
 * sibling "Toolbox Meetings" (no `section` param) — comparing `pathname`
 * alone can't tell them apart since they share one route.
 */
export function isNavItemActive(item: NavItem, pathname: string, searchParams: URLSearchParams): boolean {
  if (typeof item.matchSegment === "string") {
    // An empty matchSegment (e.g. "Project Dashboard") means the
    // project's own root — /companies/X/projects/Y with nothing further —
    // not a sub-page; every non-empty matchSegment keeps requiring the
    // literal /segment it names.
    const pattern = item.matchSegment ? `^/companies/[^/]+/projects/[^/]+/${item.matchSegment}(/|$)` : `^/companies/[^/]+/projects/[^/]+/?$`;
    return new RegExp(pattern).test(pathname);
  }
  const hrefPath = item.href.split("?")[0];
  if (item.exact) return pathname === hrefPath;
  if (pathname !== hrefPath && !pathname.startsWith(`${hrefPath}/`)) return false;
  if (!item.matchQueryParam) return true;
  return searchParams.get(item.matchQueryParam.key) === item.matchQueryParam.value;
}
