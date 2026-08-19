import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type PriorityRow = {
  scaffoldId: string;
  scaffoldNumber: number;
  workArea: string;
  responsibleForemanName: string | null;
  lastInspectionLabel: string | null;
  nextDueLabel: string | null;
  frequencyLabel: string;
  stateLabel: string;
  scaffoldHref: string;
  actionHref: string;
  actionLabel: string;
};

type InspectionPrioritySectionProps = {
  title: string;
  accentClassName: string;
  rows: PriorityRow[];
  emptyLabel: string;
  scaffoldNumberPrefix: string;
  notInspectedLabel: string;
  viewScaffoldLabel: string;
};

/**
 * One priority tier (Awaiting Initial / Expired-Due Today / Expiring
 * Tomorrow) — Part K. Card-row layout (never a wide desktop-only table)
 * so it degrades cleanly to a single mobile column (Part AJ).
 */
export function InspectionPrioritySection({ title, accentClassName, rows, emptyLabel, scaffoldNumberPrefix, notInspectedLabel, viewScaffoldLabel }: InspectionPrioritySectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className={`size-2.5 shrink-0 rounded-full ${accentClassName}`} aria-hidden="true" />
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="secondary">{rows.length}</Badge>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <Card key={row.scaffoldId}>
              <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Link href={row.scaffoldHref} className="truncate text-sm font-medium underline-offset-2 hover:underline">
                    {scaffoldNumberPrefix} {String(row.scaffoldNumber).padStart(5, "0")} · {row.workArea}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {row.responsibleForemanName ?? "—"} · {row.frequencyLabel} · {row.lastInspectionLabel ?? notInspectedLabel}
                    {row.nextDueLabel ? ` · ${row.nextDueLabel}` : ""}
                  </span>
                  <span className="text-xs font-medium">{row.stateLabel}</span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={row.scaffoldHref} />}>
                    {viewScaffoldLabel}
                  </Button>
                  <Button size="sm" nativeButton={false} render={<Link href={row.actionHref} />}>
                    {row.actionLabel}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
