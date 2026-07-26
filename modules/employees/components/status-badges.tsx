import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ACCOUNT_STATUS_LABELS, EMPLOYMENT_STATUS_LABELS } from "@/modules/employees/types";
import type { EmployeeAccountStatus, EmploymentStatus } from "@/modules/employees/types";

/**
 * Single source of truth for employee status → color, used by both the
 * list (modules/employees/components/employee-table.tsx) and the profile
 * page (modules/employees/components/employee-overview-tab.tsx, app/(app)/
 * employees/[employeeNumber]/page.tsx) — see docs/UI_GUIDELINES.md §3:
 * status colors are safety/clarity-relevant and must be assigned
 * deliberately once, not invented ad hoc per screen. The label is always
 * rendered alongside the color (never color alone), per that same section.
 *
 * `/10` background + solid-color text (light) / `/20` + lighter text
 * (dark) mirrors the existing `destructive` Badge variant's own contrast
 * approach (components/ui/badge.tsx) rather than inventing a new contrast
 * strategy — flat colors only, no gradients.
 */
type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "orange";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  danger: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  info: "bg-blue-500/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  orange: "bg-orange-500/10 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
};

const EMPLOYMENT_STATUS_TONE: Record<EmploymentStatus, BadgeTone> = {
  active: "success",
  on_leave: "warning",
  inactive: "neutral",
  terminated: "danger",
};

const ACCOUNT_STATUS_TONE: Record<EmployeeAccountStatus, BadgeTone> = {
  draft: "neutral",
  invited: "info",
  pending_activation: "warning",
  active: "success",
  suspended: "orange",
  archived: "danger",
};

export function EmploymentStatusBadge({ status, className }: { status: EmploymentStatus; className?: string }) {
  return (
    <Badge className={cn(TONE_CLASSES[EMPLOYMENT_STATUS_TONE[status]], className)}>
      {EMPLOYMENT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function AccountStatusBadge({ status, className }: { status: EmployeeAccountStatus; className?: string }) {
  return (
    <Badge className={cn(TONE_CLASSES[ACCOUNT_STATUS_TONE[status]], className)}>{ACCOUNT_STATUS_LABELS[status]}</Badge>
  );
}
