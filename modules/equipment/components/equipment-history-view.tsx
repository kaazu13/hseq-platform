import { History } from "lucide-react";
import type { EquipmentHistoryEntryWithDetail } from "@/modules/equipment/types";
import { EQUIPMENT_HISTORY_EVENT_LABELS } from "@/modules/equipment/types";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Item 14 — the History tab: every item-level lifecycle event, newest first, for one selected item. */
export function EquipmentHistoryView({ itemName, entries }: { itemName: string | null; entries: EquipmentHistoryEntryWithDetail[] }) {
  if (!itemName) {
    return <EmptyState icon={History} title="Select an item" description="Open an item's history from the Inventory tab to see its full lifecycle trail." className="flex-1" />;
  }

  if (entries.length === 0) {
    return <EmptyState icon={History} title="No history yet" description={`No recorded events for ${itemName}.`} className="flex-1" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">History for {itemName}</h2>
      <div className="flex flex-col divide-y overflow-hidden rounded-lg border">
        {entries.map((entry) => (
          <Card key={entry.id} className="rounded-none border-0 shadow-none">
            <CardContent className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">{EQUIPMENT_HISTORY_EVENT_LABELS[entry.event]}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(entry.created_at)}
                  {entry.employee ? ` · ${entry.employee.first_name} ${entry.employee.last_name}` : ""}
                  {entry.quantity ? ` · Qty ${entry.quantity}` : ""}
                </span>
                {entry.note && <span className="text-xs text-muted-foreground">{entry.note}</span>}
              </div>
              {entry.from_status && entry.to_status && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {entry.from_status} → {entry.to_status}
                </span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
