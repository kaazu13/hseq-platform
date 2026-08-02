import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { OBSERVATION_STATUS_LABELS, type ObservationStatus } from "@/modules/observations/types";

/** Same tone-mapping convention as modules/lmra/components/lmra-status-badge.tsx. */
const STATUS_TONE_CLASSES: Record<ObservationStatus, string> = {
  open: "bg-blue-500/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  closed: "bg-muted text-muted-foreground",
};

export function ObservationStatusBadge({ status, className }: { status: ObservationStatus; className?: string }) {
  return <Badge className={cn(STATUS_TONE_CLASSES[status], className)}>{OBSERVATION_STATUS_LABELS[status]}</Badge>;
}
