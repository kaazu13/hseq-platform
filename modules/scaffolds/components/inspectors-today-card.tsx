import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type InspectorTodayDisplayRow = {
  employeeId: string;
  name: string;
  statusLabel: string;
  statusVariant: "default" | "secondary" | "outline" | "destructive";
  finalizedInspectionsToday: number;
};

type InspectorsTodayCardProps = {
  title: string;
  rows: InspectorTodayDisplayRow[];
  summaryLabel: (count: number, statusLabel: string) => string;
  emptyLabel: string;
  finalizedTodayLabel: (count: number) => string;
};

/** Part M — active Inspector-role personnel on the project today, their attendance status, and finalized-inspection count. */
export function InspectorsTodayCard({ title, rows, summaryLabel, emptyLabel, finalizedTodayLabel }: InspectorsTodayCardProps) {
  const byStatus = new Map<string, { count: number; variant: InspectorTodayDisplayRow["statusVariant"] }>();
  for (const row of rows) {
    const existing = byStatus.get(row.statusLabel);
    byStatus.set(row.statusLabel, { count: (existing?.count ?? 0) + 1, variant: row.statusVariant });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {[...byStatus.entries()].map(([statusLabel, { count, variant }]) => (
                <Badge key={statusLabel} variant={variant}>
                  {summaryLabel(count, statusLabel)}
                </Badge>
              ))}
            </div>
            <ul className="flex flex-col gap-2">
              {rows.map((row) => (
                <li key={row.employeeId} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  <span className="truncate font-medium">{row.name}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={row.statusVariant}>{row.statusLabel}</Badge>
                    <span className="text-xs text-muted-foreground">{finalizedTodayLabel(row.finalizedInspectionsToday)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
