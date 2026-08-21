import { Layers } from "lucide-react";
import type { EquipmentItem } from "@/modules/equipment/types";
import { EQUIPMENT_TRACKING_MODE_LABELS } from "@/modules/equipment/types";
import { AddEditEquipmentItemDialog } from "@/modules/equipment/components/add-edit-equipment-item-dialog";
import { AdjustStockDialog } from "@/modules/equipment/components/adjust-stock-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type EquipmentCatalogViewProps = {
  companyId: string;
  projectId: string;
  projectName: string;
  items: EquipmentItem[];
  canManage: boolean;
};

/**
 * Part 22/24 — the Catalog tab: catalog-attribute-focused (name/category/
 * tracking mode/price/requestable/default validity/active), distinct from
 * the Inventory tab's stock-quantity/issue-action focus, over the SAME
 * underlying data (no second table/schema — this is a different
 * projection of listEquipmentItems' rows, per the task's explicit "do not
 * rebuild schema unnecessarily, reuse existing V2/V3 groundwork").
 * "Add serialized item" spawns another physical unit of a serialized
 * catalog entry (Part 25), pre-filled from this row.
 */
export function EquipmentCatalogView({ companyId, projectId, projectName, items, canManage }: EquipmentCatalogViewProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No catalog items"
        description={canManage ? "Add the first catalog item — an individually tracked asset type or a quantity-based item." : "No catalog items match your filters yet."}
        action={canManage ? <AddEditEquipmentItemDialog companyId={companyId} projectId={projectId} projectName={projectName} /> : undefined}
        className="flex-1"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <Card key={item.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{item.name}</span>
                <Badge variant="outline" className="text-xs">
                  {item.category}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {EQUIPMENT_TRACKING_MODE_LABELS[item.tracking_mode]}
                </Badge>
                {!item.requestable && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    Not requestable
                  </Badge>
                )}
              </div>
              <span className="text-sm text-muted-foreground">
                {item.unit_price != null ? `${Number(item.unit_price).toFixed(2)} ${item.currency}` : "No price set"}
                {item.default_validity_days ? ` · Default validity ${item.default_validity_days}d` : ""}
                {item.project_id === null ? " · Company-wide" : ""}
              </span>
            </div>
            {canManage && (
              <div className="flex shrink-0 items-center gap-2">
                {item.tracking_mode === "quantity" && !item.archived_at && (
                  <AdjustStockDialog companyId={companyId} projectId={projectId} itemId={item.id} itemName={item.name} currentQuantity={item.quantity} currentAvailable={item.available_quantity} />
                )}
                {item.tracking_mode === "serialized" && !item.archived_at && (
                  <AddEditEquipmentItemDialog
                    companyId={companyId}
                    projectId={projectId}
                    projectName={projectName}
                    duplicateFrom={item}
                    trigger={
                      <Button type="button" variant="ghost" size="sm">
                        Add serialized item
                      </Button>
                    }
                  />
                )}
                <AddEditEquipmentItemDialog companyId={companyId} projectId={projectId} projectName={projectName} item={item} />
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
