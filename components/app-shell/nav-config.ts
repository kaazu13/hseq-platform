import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Eye,
  FileBadge,
  FileText,
  FolderKanban,
  HardHat,
  LayoutDashboard,
  ListChecks,
  MessagesSquare,
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
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        status: "available",
        description: "Your company at a glance.",
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
      {
        label: "Timesheets",
        href: "/timesheets",
        icon: Clock,
        status: "planned",
        description:
          "Worked hours per employee per day, linked to the schedule, with Foreman approval before hours are considered final.",
      },
    ],
  },
  {
    label: "Projects",
    items: [
      {
        label: "Projects",
        href: "/projects",
        icon: FolderKanban,
        status: "available",
        description:
          "The contracted jobs and sites your company is executing, with Team management and status tracking from planning through archived.",
      },
      {
        label: "Equipment",
        href: "/equipment",
        icon: Wrench,
        status: "planned",
        description:
          "Tools, machinery, and site equipment — assignment, condition, and maintenance history.",
      },
    ],
  },
  {
    label: "Planning and Daily Safety",
    items: [
      {
        label: "LMRA",
        href: "/lmra",
        icon: ShieldCheck,
        status: "available",
        description:
          "A short, structured go/no-go risk check completed by a crew immediately before starting a task.",
      },
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
    ],
  },
  {
    label: "Safety Management",
    items: [
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
    label: "Scaffolding",
    items: [
      {
        label: "Scaffold Register",
        href: "/scaffolds",
        icon: HardHat,
        status: "available",
        description:
          "The scaffold register — tag numbers, type, dimensions, load class, responsible Foreman and team, and a complete chronological inspection history.",
      },
      {
        label: "Scaffold Inspections",
        href: "/scaffolds/inspections",
        icon: ClipboardList,
        status: "planned",
        description:
          "An company-wide register of scaffold inspections across every scaffold — today, an individual scaffold's inspection history is reached from its own register entry.",
      },
      {
        label: "Scaffold Defects",
        href: "/scaffolds/defects",
        icon: AlertTriangle,
        status: "planned",
        description:
          "An company-wide register of open scaffold defects across every scaffold — today, a scaffold's defects are reached from its own inspection record.",
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
        label: "Settings",
        href: "/settings",
        icon: Settings,
        status: "planned",
        description: "Company settings, membership, and role management.",
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
  const hrefPath = item.href.split("?")[0];
  if (pathname !== hrefPath && !pathname.startsWith(`${hrefPath}/`)) return false;
  if (!item.matchQueryParam) return true;
  return searchParams.get(item.matchQueryParam.key) === item.matchQueryParam.value;
}
