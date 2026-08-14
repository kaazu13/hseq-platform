import { PackageCheck } from "lucide-react";
import type { EquipmentAssignmentWithDetail } from "@/modules/equipment/types";
import { EQUIPMENT_ASSIGNMENT_STATUS_LABELS, EQUIPMENT_CONDITION_LABELS } from "@/modules/equipment/types";
import { ReturnEquipmentDialog } from "@/modules/equipment/components/return-equipment-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/** Item 6/7 — the Issued tab: every current/past assignment, with Return available for active ones. */
export function EquipmentIssuedView({ companyId, projectId, assignments, canManage }: { companyId: string; projectId: string; assignments: EquipmentAssignmentWithDetail[]; canManage: boolean }) {
  if (assignments.length === 0) {
    return <EmptyState icon={PackageCheck} title="Nothing issued yet" description="Equipment issued to employees will appear here." className="flex-1" />;
  }

  return (
    <div className="flex flex-col gap-3">
      {assignments.map((assignment) => (
        <Card key={assignment.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-semibold">
                {assignment.item.name}
                {assignment.item.reference_number ? ` (${assignment.item.reference_number})` : ""}
              </span>
              <span className="text-sm text-muted-foreground">
                {assignment.employee.first_name} {assignment.employee.last_name} · Qty {assignment.quantity} · Issued {formatDate(assignment.issued_at)}
                {assignment.expected_return_at ? ` · Due back ${formatDate(assignment.expected_return_at)}` : ""}
              </span>
              <span className="text-xs text-muted-foreground">Condition at issue: {EQUIPMENT_CONDITION_LABELS[assignment.condition_at_issue]}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge tone={assignment.status === "active" ? "info" : assignment.status === "returned" ? "positive" : "negative"}>{EQUIPMENT_ASSIGNMENT_STATUS_LABELS[assignment.status]}</StatusBadge>
              {canManage && assignment.status === "active" && <ReturnEquipmentDialog companyId={companyId} projectId={projectId} assignment={assignment} itemName={assignment.item.name} />}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
