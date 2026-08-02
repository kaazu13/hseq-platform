import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SCAFFOLD_DEFECT_STATUS_LABELS, isScaffoldDefectOverdue, type ScaffoldDefectStatus } from "@/modules/scaffold-defects/types";

const STATUS_TONE_CLASSES: Record<ScaffoldDefectStatus, string> = {
  open: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-500/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  awaiting_verification: "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  closed: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  rejected: "bg-destructive/10 text-destructive dark:bg-destructive/20",
};

/** Same "overdue always wins visually" convention as modules/corrective-actions/components/corrective-action-status-badge.tsx. */
export function ScaffoldDefectStatusBadge({ dueDate, status, className }: { dueDate: string; status: ScaffoldDefectStatus; className?: string }) {
  if (isScaffoldDefectOverdue(dueDate, status)) {
    return (
      <Badge className={cn("gap-1 bg-destructive/10 text-destructive dark:bg-destructive/20", className)}>
        <AlertTriangle className="size-3.5" aria-hidden="true" />
        Overdue
      </Badge>
    );
  }

  return <Badge className={cn(STATUS_TONE_CLASSES[status], className)}>{SCAFFOLD_DEFECT_STATUS_LABELS[status]}</Badge>;
}
