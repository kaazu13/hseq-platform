import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CORRECTIVE_ACTION_PRIORITY_LABELS, type CorrectiveActionPriority } from "@/modules/corrective-actions/types";

const PRIORITY_TONE_CLASSES: Record<CorrectiveActionPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-500/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  high: "bg-orange-500/10 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  critical: "bg-destructive/10 text-destructive dark:bg-destructive/20",
};

export function CorrectiveActionPriorityBadge({ priority, className }: { priority: CorrectiveActionPriority; className?: string }) {
  return <Badge className={cn(PRIORITY_TONE_CLASSES[priority], className)}>{CORRECTIVE_ACTION_PRIORITY_LABELS[priority]}</Badge>;
}
