import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SCAFFOLD_INSPECTION_STATUS_LABELS, type ScaffoldInspectionStatus } from "@/modules/scaffolds/types";

// Completion pass, Part 4: "draft" is an in-progress/not-yet-submitted
// state — orange per the platform's semantic color convention (pending/in
// progress), not blue (informational/navigation), which was the pre-fix
// value here. "finalized" deliberately stays neutral gray rather than
// green — it means "no longer editable," not "safe": the actual safety
// verdict (safe/unsafe/restricted) is a completely separate signal, shown
// by ScaffoldInspectionOutcomeBadge with its own green/amber/red — a
// green "Finalized" badge next to a red "Unsafe" outcome badge would send
// two conflicting signals for the same record.
const TONE_CLASSES: Record<ScaffoldInspectionStatus, string> = {
  draft: "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  finalized: "bg-muted text-muted-foreground",
};

export function ScaffoldInspectionStatusBadge({ status, className }: { status: ScaffoldInspectionStatus; className?: string }) {
  return <Badge className={cn(TONE_CLASSES[status], className)}>{SCAFFOLD_INSPECTION_STATUS_LABELS[status]}</Badge>;
}
