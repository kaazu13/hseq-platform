import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { OBSERVATION_RISK_LEVEL_LABELS, type ObservationRiskLevel } from "@/modules/observations/types";

const RISK_TONE_CLASSES: Record<ObservationRiskLevel, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  high: "bg-orange-500/10 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  critical: "bg-destructive/10 text-destructive dark:bg-destructive/20",
};

export function ObservationRiskBadge({ riskLevel, className }: { riskLevel: ObservationRiskLevel; className?: string }) {
  return <Badge className={cn(RISK_TONE_CLASSES[riskLevel], className)}>{OBSERVATION_RISK_LEVEL_LABELS[riskLevel]} risk</Badge>;
}
