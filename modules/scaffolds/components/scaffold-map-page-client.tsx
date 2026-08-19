"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { InspectionHealthState } from "@/modules/scaffolds/inspection-health";
import type { ScaffoldMapMarker } from "@/components/shared/scaffold-map-view";
import { InspectionPrioritySection, type PriorityRow } from "@/modules/scaffolds/components/inspection-priority-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ScaffoldMapView = dynamic(() => import("@/components/shared/scaffold-map-view").then((m) => m.ScaffoldMapView), {
  ssr: false,
  loading: () => <div className="h-80 w-full animate-pulse rounded-lg border bg-muted/30 sm:h-[28rem]" />,
});

type FilterKey = "all_active" | "valid" | "attention_today" | "tomorrow" | "awaiting_initial";

const FILTER_STATES: Record<FilterKey, InspectionHealthState[] | null> = {
  all_active: null,
  valid: ["valid"],
  attention_today: ["expired", "due_today"],
  tomorrow: ["expiring_tomorrow"],
  awaiting_initial: ["awaiting_initial"],
};

export type ScaffoldMapEntry = {
  marker: ScaffoldMapMarker & { healthState: InspectionHealthState };
  hasLocation: boolean;
};

type ScaffoldMapPageClientProps = {
  entries: ScaffoldMapEntry[];
  unlocatedCount: number;
  priorityAwaitingInitial: PriorityRow[];
  priorityExpiredDueToday: PriorityRow[];
  priorityExpiringTomorrow: PriorityRow[];
};

/**
 * Client-side filter state + map rendering (Part Z) — all data is fetched
 * ONCE server-side (the same getScaffoldInspectionOverview() aggregate the
 * Dashboard uses); switching a filter pill only re-slices the already-
 * loaded array in memory, never a network round-trip ("do not refetch
 * entire scaffold history when only changing local filters" — Part Z).
 */
export function ScaffoldMapPageClient({ entries, unlocatedCount, priorityAwaitingInitial, priorityExpiredDueToday, priorityExpiringTomorrow }: ScaffoldMapPageClientProps) {
  const t = useTranslations("ScaffoldMap");
  const tDash = useTranslations("InspectionDashboard");
  const [filter, setFilter] = useState<FilterKey>("all_active");

  const located = useMemo(() => entries.filter((e) => e.hasLocation), [entries]);
  const allowedStates = FILTER_STATES[filter];
  const filteredMarkers = useMemo(() => (allowedStates ? located.filter((e) => allowedStates.includes(e.marker.healthState)).map((e) => e.marker) : located.map((e) => e.marker)), [located, allowedStates]);

  const stats = useMemo(() => {
    const active = entries.filter((e) => e.marker.healthState !== "dismantled");
    return {
      active: active.length,
      valid: active.filter((e) => e.marker.healthState === "valid").length,
      dueToday: active.filter((e) => e.marker.healthState === "expired" || e.marker.healthState === "due_today").length,
      tomorrow: active.filter((e) => e.marker.healthState === "expiring_tomorrow").length,
      awaitingInitial: active.filter((e) => e.marker.healthState === "awaiting_initial").length,
    };
  }, [entries]);

  const FILTER_ORDER: FilterKey[] = ["all_active", "valid", "attention_today", "tomorrow", "awaiting_initial"];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(
          [
            { label: t("stats.active"), value: stats.active },
            { label: t("stats.valid"), value: stats.valid },
            { label: t("stats.dueToday"), value: stats.dueToday },
            { label: t("stats.tomorrow"), value: stats.tomorrow },
            { label: t("stats.awaitingInitial"), value: stats.awaitingInitial },
          ] as const
        ).map((stat) => (
          <div key={stat.label} className="flex flex-col gap-0.5 rounded-lg border p-3">
            <span className="text-xs text-muted-foreground">{stat.label}</span>
            <span className="text-xl font-semibold tabular-nums">{stat.value}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTER_ORDER.map((key) => (
          <Button key={key} type="button" size="sm" variant={filter === key ? "default" : "outline"} onClick={() => setFilter(key)}>
            {t(`filters.${key}`)}
          </Button>
        ))}
      </div>

      {unlocatedCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <Badge variant="secondary">{unlocatedCount}</Badge>
          {t("unlocatedNote")}
        </div>
      )}

      <ScaffoldMapView markers={filteredMarkers} />

      <div className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">{tDash("priorityTitle")}</h2>
        <InspectionPrioritySection
          title={tDash("priorityAwaitingInitial")}
          accentClassName={cn("bg-gray-400")}
          rows={priorityAwaitingInitial}
          emptyLabel={tDash("priorityEmpty")}
          scaffoldNumberPrefix="SC-"
          notInspectedLabel={tDash("notYetInspected")}
          viewScaffoldLabel={tDash("viewScaffold")}
        />
        <InspectionPrioritySection
          title={tDash("priorityExpiredDueToday")}
          accentClassName="bg-red-600"
          rows={priorityExpiredDueToday}
          emptyLabel={tDash("priorityEmpty")}
          scaffoldNumberPrefix="SC-"
          notInspectedLabel={tDash("notYetInspected")}
          viewScaffoldLabel={tDash("viewScaffold")}
        />
        <InspectionPrioritySection
          title={tDash("priorityExpiringTomorrow")}
          accentClassName="bg-amber-500"
          rows={priorityExpiringTomorrow}
          emptyLabel={tDash("priorityEmpty")}
          scaffoldNumberPrefix="SC-"
          notInspectedLabel={tDash("notYetInspected")}
          viewScaffoldLabel={tDash("viewScaffold")}
        />
      </div>
    </div>
  );
}
