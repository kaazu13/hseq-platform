import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/modules/projects/types";

/**
 * Same tone approach as modules/employees/components/status-badges.tsx —
 * one place status maps to color, label always rendered alongside color
 * (docs/UI_GUIDELINES.md §3), reused by both the project list cards and
 * the project detail page.
 */
const STATUS_TONE_CLASSES: Record<ProjectStatus, string> = {
  planning: "bg-blue-500/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  active: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  completed: "bg-muted text-muted-foreground",
  archived: "bg-destructive/10 text-destructive dark:bg-destructive/20",
};

export function ProjectStatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  return <Badge className={cn(STATUS_TONE_CLASSES[status], className)}>{PROJECT_STATUS_LABELS[status]}</Badge>;
}
