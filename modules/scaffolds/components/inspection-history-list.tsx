import Link from "next/link";
import type { ScaffoldInspection } from "@/modules/scaffolds/types";
import { SCAFFOLD_INSPECTION_REASON_LABELS, formatInspectionReference } from "@/modules/scaffolds/types";
import { ScaffoldInspectionStatusBadge } from "@/modules/scaffolds/components/scaffold-inspection-status-badge";
import { ScaffoldInspectionOutcomeBadge } from "@/modules/scaffolds/components/scaffold-inspection-outcome-badge";
import { Card, CardContent } from "@/components/ui/card";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** The complete chronological inspection history for a scaffold — this milestone's explicit requirement. Newest first (matches modules/scaffolds/queries.ts's listInspectionsForScaffold ordering). Superseded/corrected inspections stay visible, clearly marked, never removed. Each row links to the SAME canonical inspection-detail route the Scaffold Inspections list page also links to — one inspection view, reached from two entry points, never duplicated. `basePath` is the scaffold's own canonical URL (e.g. `/companies/:companyId/projects/:projectId/scaffolds/:scaffoldId`). */
export function InspectionHistoryList({ basePath, scaffoldNumber, inspections }: { basePath: string; scaffoldNumber: number; inspections: ScaffoldInspection[] }) {
  return (
    <div className="flex flex-col gap-3">
      {inspections.map((inspection) => (
        <Link key={inspection.id} href={`${basePath}/inspections/${inspection.id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="flex flex-col gap-2 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-sm font-medium">{formatInspectionReference({ scaffold_number: scaffoldNumber }, inspection)}</span>
                <div className="flex items-center gap-2">
                  <ScaffoldInspectionStatusBadge status={inspection.status} />
                  {inspection.outcome && <ScaffoldInspectionOutcomeBadge outcome={inspection.outcome} />}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{SCAFFOLD_INSPECTION_REASON_LABELS[inspection.inspection_reason]} · {formatDateTime(inspection.inspected_at)}</p>
              {inspection.superseded_by_id && <p className="text-xs text-muted-foreground">Superseded by a correction</p>}
              {inspection.corrects_inspection_id && <p className="text-xs text-muted-foreground">Corrects an earlier inspection</p>}
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
