import { Boxes, PackageCheck, ClipboardList, Timer, AlertTriangle, Layers, ShieldCheck } from "lucide-react";
import type { EquipmentOverviewMetrics } from "@/modules/equipment/types";
import { Card, CardContent } from "@/components/ui/card";

type MetricDef = {
  key: keyof EquipmentOverviewMetrics;
  label: string;
  icon: typeof Boxes;
  tone?: "attention" | "negative";
};

const METRICS: MetricDef[] = [
  { key: "catalogItems", label: "Catalog items", icon: Layers },
  { key: "availableStock", label: "Available stock", icon: Boxes },
  { key: "serializedAvailable", label: "Serialized available", icon: ShieldCheck },
  { key: "currentlyIssued", label: "Currently issued", icon: PackageCheck },
  { key: "pendingRequests", label: "Pending requests", icon: ClipboardList },
  { key: "expiringSoon", label: "Expiring ≤30d", icon: Timer, tone: "attention" },
  { key: "expired", label: "Expired", icon: AlertTriangle, tone: "negative" },
];

/** Part 23 — the Overview tab: compact aggregate metrics only, never exposed to self-service roles (the page only renders this tab when canManage is true). */
export function EquipmentOverview({ metrics }: { metrics: EquipmentOverviewMetrics }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {METRICS.map(({ key, label, icon: Icon, tone }) => {
        const value = metrics[key];
        const highlight = tone && value > 0;
        return (
          <Card key={key}>
            <CardContent className="flex items-center gap-3 py-4">
              <Icon className={highlight ? (tone === "negative" ? "size-5 text-destructive" : "size-5 text-amber-600 dark:text-amber-500") : "size-5 text-muted-foreground"} />
              <div className="flex flex-col">
                <span className={highlight ? (tone === "negative" ? "text-lg font-semibold text-destructive" : "text-lg font-semibold text-amber-600 dark:text-amber-500") : "text-lg font-semibold"}>{value}</span>
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
