import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SCAFFOLD_INSPECTION_STATUS_LABELS, type ScaffoldInspectionStatus } from "@/modules/scaffolds/types";

const TONE_CLASSES: Record<ScaffoldInspectionStatus, string> = {
  draft: "bg-blue-500/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  finalized: "bg-muted text-muted-foreground",
};

export function ScaffoldInspectionStatusBadge({ status, className }: { status: ScaffoldInspectionStatus; className?: string }) {
  return <Badge className={cn(TONE_CLASSES[status], className)}>{SCAFFOLD_INSPECTION_STATUS_LABELS[status]}</Badge>;
}
