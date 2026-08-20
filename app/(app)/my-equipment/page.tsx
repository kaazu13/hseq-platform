import { Wrench } from "lucide-react";
import { getTranslations, getFormatter } from "next-intl/server";
import { requireUser } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { resolveCurrentProject } from "@/modules/projects/queries";
import { getMyEmployeeId } from "@/modules/daily-workforce/queries";
import { listMyEquipmentAssignments, listMyEquipmentRequests, listRequestableEquipmentItems } from "@/modules/equipment/queries";
import { EQUIPMENT_ASSIGNMENT_STATUS_LABELS, EQUIPMENT_REQUEST_STATUS_LABELS, EQUIPMENT_CONDITION_LABELS, equipmentRequestStatusTone, describeEquipmentExpiry } from "@/modules/equipment/types";
import { RequestEquipmentDialog } from "@/modules/equipment/components/request-equipment-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionHeader } from "@/components/shared/section-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { SEMANTIC_TONE_TEXT_CLASSES } from "@/components/shared/status-tone";
import { Card, CardContent } from "@/components/ui/card";

function formatDate(value: string | null, format: Awaited<ReturnType<typeof getFormatter>>): string {
  if (!value) return "—";
  return format.dateTime(new Date(`${value}T00:00:00Z`), { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
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
  const [t, format] = await Promise.all([getTranslations("MyEquipment"), getFormatter()]);

  if (!currentCompanyId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title={t("title")} />
        <EmptyState icon={Wrench} title={t("noCompanyTitle")} description={t("noCompanyDescription")} className="flex-1" />
      </div>
    );
  }

  const { currentProjectId } = await resolveCurrentProject(user.id, currentCompanyId);
  if (!currentProjectId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title={t("title")} />
        <EmptyState icon={Wrench} title={t("noProjectTitle")} description={t("noProjectDescription")} className="flex-1" />
      </div>
    );
  }

  const myEmployeeId = await getMyEmployeeId(currentCompanyId, user.id);
  if (!myEmployeeId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title={t("title")} />
        <EmptyState icon={Wrench} title={t("noEmployeeTitle")} description={t("noEmployeeDescription")} className="flex-1" />
      </div>
    );
  }

  const [assignments, requests, candidateItems] = await Promise.all([
    listMyEquipmentAssignments(currentCompanyId, myEmployeeId),
    listMyEquipmentRequests(currentCompanyId, myEmployeeId),
    listRequestableEquipmentItems(currentCompanyId, currentProjectId),
  ]);

  // Part 30 — the value of currently-issued equipment ONLY (never company
  // stock or other employees' equipment). A null unit_price is simply
  // excluded from the total (Part 44: pricing is nullable, never treated
  // as €0). Assumes a single currency across an employee's issued items —
  // this company-wide fixture/deployment doesn't mix currencies; a truly
  // mixed-currency total would need per-currency subtotals, out of scope here.
  const pricedAssignments = assignments.filter((a) => a.status === "active" && a.item.unit_price != null);
  const totalValue = pricedAssignments.reduce((sum, a) => sum + Number(a.item.unit_price) * (a.item.tracking_mode === "quantity" ? a.quantity : 1), 0);
  const totalValueCurrency = pricedAssignments[0]?.item.currency ?? "EUR";

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title={t("title")} actions={<RequestEquipmentDialog companyId={currentCompanyId} projectId={currentProjectId} candidateItems={candidateItems} />} />

      <div className="flex flex-col gap-3">
        <SectionHeader title={t("currentlyIssued")} />
        {pricedAssignments.length > 0 && (
          <Card>
            <CardContent className="flex items-baseline justify-between py-3">
              <span className="text-sm text-muted-foreground">{t("totalAssignedValue")}</span>
              <span className="text-lg font-semibold tabular-nums">{format.number(totalValue, { style: "currency", currency: totalValueCurrency })}</span>
            </CardContent>
          </Card>
        )}
        {assignments.length === 0 ? (
          <EmptyState icon={Wrench} title={t("nothingIssuedTitle")} description={t("nothingIssuedDescription")} />
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
                      {assignment.item.reference_number && <span className="text-xs text-muted-foreground">{t("refNumber", { ref: assignment.item.reference_number })}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{assignment.issuedByName ? t("issuedByOn", { date: formatDate(assignment.issued_at, format), name: assignment.issuedByName }) : t("issuedOn", { date: formatDate(assignment.issued_at, format) })}</span>
                      {assignment.item.tracking_mode === "quantity" && <span>{t("qty", { count: assignment.quantity })}</span>}
                      <span>{t("condition", { condition: EQUIPMENT_CONDITION_LABELS[assignment.condition_at_issue] })}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <span className="text-muted-foreground">{assignment.expires_at ? t("validityExpires", { date: formatDate(assignment.expires_at, format) }) : t("validityNoExpiry")}</span>
                      {assignment.expires_at && <span className={SEMANTIC_TONE_TEXT_CLASSES[expiry.tone]}>{expiry.label}</span>}
                    </div>
                    {assignment.item.unit_price != null && (
                      <div className="text-xs text-muted-foreground">
                        {assignment.item.tracking_mode === "quantity"
                          ? t("priceEach", { price: format.number(Number(assignment.item.unit_price), { style: "currency", currency: assignment.item.currency }) })
                          : t("price", { price: format.number(Number(assignment.item.unit_price), { style: "currency", currency: assignment.item.currency }) })}
                      </div>
                    )}
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
        <SectionHeader title={t("myRequests")} />
        {requests.length === 0 ? (
          <EmptyState icon={Wrench} title={t("noRequestsTitle")} description={t("noRequestsDescription")} />
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
                    <span className="text-xs text-muted-foreground">{t("qtyAndDate", { count: request.quantity, date: formatDate(request.created_at.slice(0, 10), format) })}</span>
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
