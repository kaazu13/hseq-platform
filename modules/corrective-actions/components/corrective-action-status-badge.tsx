import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CORRECTIVE_ACTION_STATUS_LABELS, isCorrectiveActionOverdue, type CorrectiveActionStatus } from "@/modules/corrective-actions/types";

const STATUS_TONE_CLASSES: Record<CorrectiveActionStatus, string> = {
  open: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-500/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  awaiting_verification: "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  closed: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  rejected: "bg-destructive/10 text-destructive dark:bg-destructive/20",
};

/**
 * Renders the plain status tone, UNLESS the action is overdue (derived via
 * isCorrectiveActionOverdue() — never a stored column, this milestone's
 * explicit requirement), in which case it always wins visually — an
 * overdue open/in_progress action is a more urgent fact than its nominal
 * status.
 */
export function CorrectiveActionStatusBadge({ dueDate, status, className }: { dueDate: string; status: CorrectiveActionStatus; className?: string }) {
  if (isCorrectiveActionOverdue(dueDate, status)) {
    return (
      <Badge className={cn("gap-1 bg-destructive/10 text-destructive dark:bg-destructive/20", className)}>
        <AlertTriangle className="size-3.5" aria-hidden="true" />
        Overdue
      </Badge>
    );
  }

  return <Badge className={cn(STATUS_TONE_CLASSES[status], className)}>{CORRECTIVE_ACTION_STATUS_LABELS[status]}</Badge>;
}
