import Link from "next/link";
import { Calendar, MapPin } from "lucide-react";
import { LMRA_SHIFT_LABELS, type LmraAssessment } from "@/modules/lmra/types";
import { LmraStatusBadge } from "@/modules/lmra/components/lmra-status-badge";
import { LmraResultBadge } from "@/modules/lmra/components/lmra-result-badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/** LMRA list card — same visual shape as modules/projects/components/project-card.tsx for cross-module consistency. Result badge only shown once a decision has actually been made (draft rows have no result yet worth surfacing). */
export function LmraCard({ assessment, projectName }: { assessment: LmraAssessment; projectName: string }) {
  return (
    <Link href={`/lmra/${assessment.id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
      <Card className="gap-0 py-0 transition-shadow hover:shadow-md">
        <CardHeader className="gap-2 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">{assessment.work_activity}</span>
              <span className="text-sm text-muted-foreground">{projectName}</span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <LmraStatusBadge status={assessment.status} />
              {assessment.status !== "draft" && <LmraResultBadge result={assessment.result} />}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 p-4 pt-0 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" />
            {assessment.work_area}
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="size-3.5 shrink-0" />
            {formatDate(assessment.work_date)} · {LMRA_SHIFT_LABELS[assessment.shift]}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
