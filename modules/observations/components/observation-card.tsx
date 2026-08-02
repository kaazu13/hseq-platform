import Link from "next/link";
import { Calendar, MapPin, ShieldAlert } from "lucide-react";
import type { SafetyObservation } from "@/modules/observations/types";
import { ObservationStatusBadge } from "@/modules/observations/components/observation-status-badge";
import { ObservationCategoryBadge } from "@/modules/observations/components/observation-category-badge";
import { ObservationRiskBadge } from "@/modules/observations/components/observation-risk-badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Observation list card — same visual shape as modules/lmra/components/lmra-card.tsx for cross-module consistency. */
export function ObservationCard({ observation, projectName }: { observation: SafetyObservation; projectName: string }) {
  return (
    <Link href={`/observations/${observation.id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
      <Card className="gap-0 py-0 transition-shadow hover:shadow-md">
        <CardHeader className="gap-2 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="line-clamp-2 font-semibold">{observation.description}</span>
              <span className="text-sm text-muted-foreground">{projectName}</span>
            </div>
            <ObservationStatusBadge status={observation.status} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <ObservationCategoryBadge category={observation.category} />
            <ObservationRiskBadge riskLevel={observation.risk_level} />
            {observation.is_stop_work && (
              <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive dark:bg-destructive/20">
                <ShieldAlert className="size-3.5" aria-hidden="true" />
                Stop work
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 p-4 pt-0 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" />
            {observation.work_area}
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="size-3.5 shrink-0" />
            {formatDateTime(observation.observed_at)}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
