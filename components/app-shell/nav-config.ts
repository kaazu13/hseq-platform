import {
  AlertTriangle,
  BarChart3,
  ClipboardCheck,
  Clock,
  FileBadge,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  MessagesSquare,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Single source of truth for the primary navigation — see
 * docs/UI_GUIDELINES.md §4 and docs/ARCHITECTURE.md §4. Every entry here
 * gets a real route (app/(app)/<href>/page.tsx); the sidebar, the
 * breadcrumb trail, and each placeholder "Coming soon" page all read from
 * this same list, so there is exactly one place that defines "what modules
 * exist" and no route this list doesn't account for.
 *
 * `status: "available"` is the only module with a real page behind it in
 * this milestone. Everything else is `"planned"` — a real route exists (so
 * the link is never broken) but it renders a shared placeholder, not a
 * business module. See docs/IMPLEMENTATION_PLAN.md — M7.5.
 */
export type NavStatus = "available" | "planned";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  status: NavStatus;
  /** Shown on the item's own "Coming soon" placeholder page. */
  description: string;
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
        description: "Your organization at a glance.",
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
        status: "planned",
        description:
          "HR-facing records for everyone working for your organization — job title, trade, employment type, documents, and emergency contacts.",
      },
      {
        label: "Timesheets",
        href: "/timesheets",
        icon: Clock,
        status: "planned",
        description:
          "Worked hours per employee per day, linked to the schedule, with supervisor approval before hours are considered final.",
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
        status: "planned",
        description:
          "The contracted jobs and sites your organization is executing, with status tracking from planned through closed.",
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
    label: "HSEQ",
    items: [
      {
        label: "LMRA",
        href: "/lmra",
        icon: ShieldCheck,
        status: "planned",
        description:
          "A short, structured go/no-go risk check completed by a crew immediately before starting a task.",
      },
      {
        label: "Toolbox Talks",
        href: "/toolbox-talks",
        icon: MessagesSquare,
        status: "planned",
        description:
          "Records of safety briefings given to a crew — topic, presenter, and attendee sign-off.",
      },
      {
        label: "Inspections",
        href: "/inspections",
        icon: ClipboardCheck,
        status: "planned",
        description:
          "Structured scaffold inspections and safety walks, with checklist results and photo evidence.",
      },
      {
        label: "Incidents",
        href: "/incidents",
        icon: AlertTriangle,
        status: "planned",
        description:
          "Formal records of incidents and near-misses, with severity classification, investigation, and follow-up.",
      },
      {
        label: "Corrective Actions",
        href: "/corrective-actions",
        icon: ListChecks,
        status: "planned",
        description:
          "Tracked remediation tasks raised from inspections, incidents, or safety observations, with an owner and due date.",
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
    label: "Records",
    items: [
      {
        label: "Documents",
        href: "/documents",
        icon: FileText,
        status: "planned",
        description:
          "General organization and project documents, separate from individual employee certificates.",
      },
      {
        label: "Reports",
        href: "/reports",
        icon: BarChart3,
        status: "planned",
        description:
          "Role-scoped dashboards and exports summarizing hours, attendance, safety, and compliance.",
      },
    ],
  },
];

export const SETTINGS_NAV_ITEM: NavItem = {
  label: "Settings",
  href: "/settings",
  icon: Settings,
  status: "planned",
  description: "Organization settings, membership, and role management.",
};

/** Flat list of every nav item (including Settings) — used by the breadcrumb trail and to generate placeholder routes consistently. */
export const ALL_NAV_ITEMS: NavItem[] = [
  ...NAV_GROUPS.flatMap((group) => group.items),
  SETTINGS_NAV_ITEM,
];
