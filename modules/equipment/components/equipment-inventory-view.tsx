import Link from "next/link";
import { Package } from "lucide-react";
import type { EquipmentItem } from "@/modules/equipment/types";
import { EQUIPMENT_STATUS_LABELS, EQUIPMENT_CONDITION_LABELS, equipmentStatusTone, equipmentConditionTone, equipmentIssuedQuantity } from "@/modules/equipment/types";
import type { EmployeeOption } from "@/modules/employees/employee-options";
import { AddEditEquipmentItemDialog } from "@/modules/equipment/components/add-edit-equipment-item-dialog";
import { IssueEquipmentDialog } from "@/modules/equipment/components/issue-equipment-dialog";
import { EquipmentStatusActionDialog } from "@/modules/equipment/components/equipment-status-action-dialog";
import { RetireEquipmentDialog } from "@/modules/equipment/components/retire-equipment-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type EquipmentInventoryViewProps = {
  companyId: string;
  projectId: string;
  projectName: string;
  items: EquipmentItem[];
  candidateItems: EquipmentItem[];
  employees: EmployeeOption[];
  canManage: boolean;
  basePath: string;
};

/** Item 4 — the Inventory tab. One card per item, showing everything item 4 requires (item, reference, spec, available/issued, status, condition, location) with the authorized actions (Issue/Edit/Mark out of service via damage/Retire/View history). */
export function EquipmentInventoryView({ companyId, projectId, projectName, items, candidateItems, employees, canManage, basePath }: EquipmentInventoryViewProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="No equipment found"
        description={canManage ? "Add the first item to this company or project's inventory." : "No equipment matches your filters yet."}
        action={canManage ? <AddEditEquipmentItemDialog companyId={companyId} projectId={projectId} projectName={projectName} /> : undefined}
        className="flex-1"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        const issuedQuantity = equipmentIssuedQuantity(item);
        const canIssue = item.status !== "retired" && item.status !== "lost" && item.status !== "out_of_service" && item.available_quantity > 0;
        return (
          <Card key={item.id}>
            <CardContent className="flex flex-col gap-3 pt-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{item.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {item.category}
                    </Badge>
                    {item.project_id === null && (
                      <Badge variant="secondary" className="text-xs">
                        Company-wide
                      </Badge>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {[item.reference_number, item.specification, item.manufacturer, item.model].filter(Boolean).join(" · ") || "—"}
                  </span>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <StatusBadge tone={equipmentStatusTone(item.status)}>{EQUIPMENT_STATUS_LABELS[item.status]}</StatusBadge>
                  <StatusBadge tone={equipmentConditionTone(item.condition)}>{EQUIPMENT_CONDITION_LABELS[item.condition]}</StatusBadge>
                </div>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                <span>Available: <span className="font-medium text-foreground">{item.available_quantity}</span></span>
                <span>Issued: <span className="font-medium text-foreground">{issuedQuantity}</span></span>
                <span>Total: <span className="font-medium text-foreground">{item.quantity}</span></span>
                {item.location && <span>Location: <span className="font-medium text-foreground">{item.location}</span></span>}
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <Link href={`${basePath}?tab=history&itemId=${item.id}`} className="text-sm font-medium text-primary hover:underline">
                  View history
                </Link>
                {canManage && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <AddEditEquipmentItemDialog companyId={companyId} projectId={projectId} projectName={projectName} item={item} />
                    {canIssue && (
                      <IssueEquipmentDialog
                        companyId={companyId}
                        projectId={projectId}
                        items={candidateItems.length > 0 ? candidateItems : [item]}
                        employees={employees}
                        trigger={
                          <span className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium hover:bg-accent">
                            Issue
                          </span>
                        }
                      />
                    )}
                    {item.status !== "retired" && item.status !== "lost" && (
                      <EquipmentStatusActionDialog companyId={companyId} projectId={projectId} itemId={item.id} itemName={item.name} action="damage" maxQuantity={item.quantity} trackingMode={item.tracking_mode} />
                    )}
                    {item.status !== "retired" && (
                      <EquipmentStatusActionDialog companyId={companyId} projectId={projectId} itemId={item.id} itemName={item.name} action="lost" maxQuantity={item.quantity} trackingMode={item.tracking_mode} />
                    )}
                    {(item.status === "lost" || item.status === "out_of_service") && (
                      <EquipmentStatusActionDialog companyId={companyId} projectId={projectId} itemId={item.id} itemName={item.name} action="recover" maxQuantity={item.quantity} trackingMode={item.tracking_mode} />
                    )}
                    {item.status !== "retired" && <RetireEquipmentDialog companyId={companyId} projectId={projectId} itemId={item.id} itemName={item.name} />}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
