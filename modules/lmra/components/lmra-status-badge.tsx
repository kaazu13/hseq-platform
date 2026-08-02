import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LMRA_STATUS_LABELS, type LmraStatus } from "@/modules/lmra/types";

/** Same tone-mapping convention as modules/projects/components/project-status-badge.tsx — the workflow status (draft/submitted/approved/rejected/archived), distinct from the go/no-go result (see lmra-result-badge.tsx). */
const STATUS_TONE_CLASSES: Record<LmraStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-blue-500/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  approved: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  rejected: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  archived: "bg-muted text-muted-foreground",
};

export function LmraStatusBadge({ status, className }: { status: LmraStatus; className?: string }) {
  return <Badge className={cn(STATUS_TONE_CLASSES[status], className)}>{LMRA_STATUS_LABELS[status]}</Badge>;
}
