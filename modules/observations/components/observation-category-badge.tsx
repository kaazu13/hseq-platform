import { PartyPopper, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { OBSERVATION_CATEGORY_LABELS, isPositiveObservationCategory, type ObservationCategory } from "@/modules/observations/types";

/**
 * The one place positive-vs-issue is visually distinguished — this
 * milestone's explicit "clearly distinguish positive observations from
 * safety issues" requirement. Positive gets success/green with a
 * celebratory icon; every other category gets a neutral/warning tone with
 * a hazard icon — never the same visual treatment, mirroring
 * docs/UI_GUIDELINES.md §3's "do not rely on color alone" principle (both
 * color AND icon differ, not just color).
 */
export function ObservationCategoryBadge({ category, className }: { category: ObservationCategory; className?: string }) {
  const isPositive = isPositiveObservationCategory(category);
  return (
    <Badge
      className={cn(
        isPositive
          ? "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
          : "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
        "gap-1",
        className,
      )}
    >
      {isPositive ? <PartyPopper className="size-3.5" aria-hidden="true" /> : <TriangleAlert className="size-3.5" aria-hidden="true" />}
      {OBSERVATION_CATEGORY_LABELS[category]}
    </Badge>
  );
}
