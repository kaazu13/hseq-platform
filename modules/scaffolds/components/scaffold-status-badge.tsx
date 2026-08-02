import { AlertTriangle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getScaffoldDisplayStatus, SCAFFOLD_DISPLAY_STATUS_LABELS, type ScaffoldStatus } from "@/modules/scaffolds/types";

/**
 * Renders the fully time-aware display status (docs' explicit "clear
 * visual distinction between: Safe / Restricted / Expiring soon / Expired
 * / Unsafe / Closed or dismantled" requirement) — combines the stored
 * snapshot with the current inspection's expiry via
 * getScaffoldDisplayStatus() so an expired inspection never shows as if
 * it were still currently valid.
 */
const TONE_CLASSES: Record<ReturnType<typeof getScaffoldDisplayStatus>, string> = {
  pending_inspection: "bg-muted text-muted-foreground",
  safe: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  restricted: "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  awaiting_corrective_action: "bg-orange-500/10 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  expiring_soon: "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  expired: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  unsafe: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  closed: "bg-muted text-muted-foreground",
};

export function ScaffoldStatusBadge({ status, currentInspectionExpiresAt, className }: { status: ScaffoldStatus; currentInspectionExpiresAt: string | null; className?: string }) {
  const displayStatus = getScaffoldDisplayStatus(status, currentInspectionExpiresAt);
  const showIcon = displayStatus === "expired" || displayStatus === "unsafe";
  const showClock = displayStatus === "expiring_soon";

  return (
    <Badge className={cn(TONE_CLASSES[displayStatus], "gap-1", className)}>
      {showIcon && <AlertTriangle className="size-3.5" aria-hidden="true" />}
      {showClock && <Clock className="size-3.5" aria-hidden="true" />}
      {SCAFFOLD_DISPLAY_STATUS_LABELS[displayStatus]}
    </Badge>
  );
}
