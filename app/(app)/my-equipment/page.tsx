import { Wrench } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { resolveCurrentProject } from "@/modules/projects/queries";
import { getMyEmployeeId } from "@/modules/daily-workforce/queries";
import { listMyEquipmentAssignments, listMyEquipmentRequests, listEquipmentCandidateItems } from "@/modules/equipment/queries";
import { EQUIPMENT_ASSIGNMENT_STATUS_LABELS, EQUIPMENT_REQUEST_STATUS_LABELS, EQUIPMENT_CONDITION_LABELS, equipmentRequestStatusTone, describeEquipmentExpiry } from "@/modules/equipment/types";
import { RequestEquipmentDialog } from "@/modules/equipment/components/request-equipment-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionHeader } from "@/components/shared/section-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { SEMANTIC_TONE_TEXT_CLASSES } from "@/components/shared/status-tone";
import { Card, CardContent } from "@/components/ui/card";

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

  const [assignments, requests, candidateItems] = await Promise.all([
    listMyEquipmentAssignments(currentCompanyId, myEmployeeId),
    listMyEquipmentRequests(currentCompanyId, myEmployeeId),
    listEquipmentCandidateItems(currentCompanyId, currentProjectId),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="My Equipment" actions={<RequestEquipmentDialog companyId={currentCompanyId} projectId={currentProjectId} candidateItems={candidateItems} />} />

      <div className="flex flex-col gap-3">
        <SectionHeader title="Currently issued" />
        {assignments.length === 0 ? (
          <EmptyState icon={Wrench} title="Nothing issued to you right now" description="Equipment issued to you will appear here." />
        ) : (
          <div className="flex flex-col gap-2">
            {assignments.map((assignment) => {
              const expiry = describeEquipmentExpiry(assignment.expires_at);
              return (
                <div key={assignment.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium">{assignment.item.name}</span>
                      <span className="text-xs text-muted-foreground">{assignment.item.category}</span>
                      {assignment.item.reference_number && <span className="text-xs text-muted-foreground">Ref {assignment.item.reference_number}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>Issued {formatDate(assignment.issued_at)}{assignment.issuedByName ? ` by ${assignment.issuedByName}` : ""}</span>
                      {assignment.item.tracking_mode === "quantity" && <span>Qty {assignment.quantity}</span>}
                      <span>Condition: {EQUIPMENT_CONDITION_LABELS[assignment.condition_at_issue]}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <span className="text-muted-foreground">{assignment.expires_at ? `Validity: expires ${formatDate(assignment.expires_at)}` : "Validity: No expiry set"}</span>
                      {assignment.expires_at && <span className={SEMANTIC_TONE_TEXT_CLASSES[expiry.tone]}>{expiry.label}</span>}
                    </div>
                  </div>
                  <StatusBadge tone="info" className="w-fit shrink-0">
                    {EQUIPMENT_ASSIGNMENT_STATUS_LABELS[assignment.status]}
                  </StatusBadge>
                </div>
              );
            })}
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
