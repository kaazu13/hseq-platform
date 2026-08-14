import Link from "next/link";
import { Wrench } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { resolveCurrentProject } from "@/modules/projects/queries";
import { getMyEmployeeId } from "@/modules/daily-workforce/queries";
import { listMyEquipmentAssignments, listMyEquipmentRequests } from "@/modules/equipment/queries";
import { EQUIPMENT_ASSIGNMENT_STATUS_LABELS, EQUIPMENT_REQUEST_STATUS_LABELS, EQUIPMENT_CONDITION_LABELS, equipmentRequestStatusTone } from "@/modules/equipment/types";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionHeader } from "@/components/shared/section-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Item 13 — "My Equipment", the employee's own personal view: currently
 * issued equipment, request status, and recent history. Never another
 * employee's records — every query here is explicitly scoped to the
 * caller's own linked employee id, same "do not expose other employees'
 * issued equipment" guarantee as every other personal view in this app.
 */
export default async function MyEquipmentPage() {
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="My Equipment" />
        <EmptyState icon={Wrench} title="You're not part of an company yet" description="Once an administrator adds your account to one, your equipment will appear here." className="flex-1" />
      </div>
    );
  }

  const { currentProjectId } = await resolveCurrentProject(user.id, currentCompanyId);
  if (!currentProjectId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="My Equipment" />
        <EmptyState icon={Wrench} title="No active project selected" description="Choose a project using the switcher at the top of the page." className="flex-1" />
      </div>
    );
  }

  const myEmployeeId = await getMyEmployeeId(currentCompanyId, user.id);
  if (!myEmployeeId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="My Equipment" />
        <EmptyState icon={Wrench} title="No employee record linked" description="Contact your administrator to link your account to an employee record." className="flex-1" />
      </div>
    );
  }

  const [assignments, requests] = await Promise.all([listMyEquipmentAssignments(currentCompanyId, myEmployeeId), listMyEquipmentRequests(currentCompanyId, myEmployeeId)]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="My Equipment"
        actions={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/companies/${currentCompanyId}/projects/${currentProjectId}/equipment`} />}>
            View project equipment
          </Button>
        }
      />

      <div className="flex flex-col gap-3">
        <SectionHeader title="Currently issued" />
        {assignments.length === 0 ? (
          <EmptyState icon={Wrench} title="Nothing issued to you right now" description="Equipment issued to you will appear here." />
        ) : (
          <div className="flex flex-col gap-2">
            {assignments.map((assignment) => (
              <Card key={assignment.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium">
                      {assignment.item.name}
                      {assignment.item.reference_number ? ` (${assignment.item.reference_number})` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Qty {assignment.quantity} · Issued {formatDate(assignment.issued_at)} · Condition at issue: {EQUIPMENT_CONDITION_LABELS[assignment.condition_at_issue]}
                    </span>
                  </div>
                  <StatusBadge tone="info">{EQUIPMENT_ASSIGNMENT_STATUS_LABELS[assignment.status]}</StatusBadge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeader title="My requests" />
        {requests.length === 0 ? (
          <EmptyState icon={Wrench} title="No requests yet" description="Equipment requests you submit will appear here." />
        ) : (
          <div className="flex flex-col gap-2">
            {requests.map((request) => (
              <Card key={request.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium">
                      {request.item_description}
                      {request.specification ? ` — ${request.specification}` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">Qty {request.quantity} · {formatDate(request.created_at.slice(0, 10))}</span>
                    {request.decision_comment && <span className="text-xs text-muted-foreground">{request.decision_comment}</span>}
                  </div>
                  <StatusBadge tone={equipmentRequestStatusTone(request.status)}>{EQUIPMENT_REQUEST_STATUS_LABELS[request.status]}</StatusBadge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
