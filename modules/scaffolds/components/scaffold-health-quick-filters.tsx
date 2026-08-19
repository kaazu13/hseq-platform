import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { InspectionHealthState } from "@/modules/scaffolds/inspection-health";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const QUICK_FILTER_STATES: InspectionHealthState[] = ["awaiting_initial", "expired", "due_today", "expiring_tomorrow", "valid"];

type ScaffoldHealthQuickFiltersProps = {
  basePath: string;
  activeHealth: InspectionHealthState | undefined;
  counts: Record<InspectionHealthState, number>;
};

/**
 * Part 10 — "an Inspector should quickly know: what needs inspection
 * now?" Compact chips reusing the SAME shared health resolver the
 * Inspection Dashboard/Scaffold Map use — no new/duplicate status logic.
 * A plain server-rendered link row (?health=...), no client JS needed.
 */
export async function ScaffoldHealthQuickFilters({ basePath, activeHealth, counts }: ScaffoldHealthQuickFiltersProps) {
  const t = await getTranslations("InspectionDashboard");

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={basePath}
        className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", !activeHealth ? "border-primary bg-primary/10 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
      >
        {t("allScaffolds")}
      </Link>
      {QUICK_FILTER_STATES.map((state) => (
        <Link
          key={state}
          href={`${basePath}?health=${state}`}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            activeHealth === state ? "border-primary bg-primary/10 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t(`state.${state}`)}
          <Badge variant="secondary" className="h-4 min-w-4 px-1">
            {counts[state]}
          </Badge>
        </Link>
      ))}
    </div>
  );
}
