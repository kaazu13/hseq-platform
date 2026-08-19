import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type LatestInspectionRow = {
  inspectionId: string;
  reference: string;
  scaffoldNumber: number;
  workArea: string;
  inspectorName: string;
  finalizedAtLabel: string;
  outcomeLabel: string;
  nextDueLabel: string | null;
  statusLabel: string;
  href: string;
};

/** Part L — latest 10 finalized inspections, newest first, bounded. */
export function LatestInspectionsList({ rows, emptyLabel, scaffoldNumberPrefix }: { rows: LatestInspectionRow[]; emptyLabel: string; scaffoldNumberPrefix: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <Link key={row.inspectionId} href={row.href} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">
                  {row.reference} · {scaffoldNumberPrefix} {String(row.scaffoldNumber).padStart(5, "0")} · {row.workArea}
                </span>
                <span className="text-xs text-muted-foreground">
                  {row.inspectorName} · {row.finalizedAtLabel}
                  {row.nextDueLabel ? ` · ${row.nextDueLabel}` : ""}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline">{row.outcomeLabel}</Badge>
                <span className="text-xs font-medium text-muted-foreground">{row.statusLabel}</span>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
