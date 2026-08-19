import { Card, CardContent } from "@/components/ui/card";

type Kpi = { label: string; value: number };

/** Part I — the 7 top KPI cards. Responsive: 2-column on mobile, up to 4-column on desktop (Part AJ). */
export function InspectionKpiCards({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label} size="sm">
          <CardContent className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{kpi.label}</span>
            <span className="text-2xl font-semibold tabular-nums">{kpi.value}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
