import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SCAFFOLD_DEFECT_SEVERITY_LABELS, type ScaffoldDefectSeverity } from "@/modules/scaffold-defects/types";

const SEVERITY_TONE_CLASSES: Record<ScaffoldDefectSeverity, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-500/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  high: "bg-orange-500/10 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  critical: "bg-destructive/10 text-destructive dark:bg-destructive/20",
};

export function ScaffoldDefectSeverityBadge({ severity, className }: { severity: ScaffoldDefectSeverity; className?: string }) {
  return <Badge className={cn(SEVERITY_TONE_CLASSES[severity], className)}>{SCAFFOLD_DEFECT_SEVERITY_LABELS[severity]}</Badge>;
}
