import { CalendarClock } from "lucide-react";
import { getTranslations, getFormatter } from "next-intl/server";
import { requireUser } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getMyEmployeeId } from "@/modules/daily-workforce/queries";
import { listMyLeaveRequests, resolveDeciderNames } from "@/modules/leave-requests/queries";
import { listMyAbsenceReports } from "@/modules/absences/queries";
import { LEAVE_TYPE_LABELS, LEAVE_REQUEST_STATUS_LABELS } from "@/modules/leave-requests/types";
import { ABSENCE_REPORT_REASON_LABELS, ABSENCE_REPORT_STATUS_LABELS } from "@/modules/absences/types";
import { AccountSubnav } from "@/modules/account/components/account-subnav";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type AccountRequestsPageProps = {
  searchParams: Promise<{ type?: string; id?: string }>;
};

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  approved: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  confirmed: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  denied: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  rejected: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  returned: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

/**
 * Part 15 — Account > Requests. PERSONAL ONLY: the signed-in user's own
 * leave requests and absence reports, merged into one reverse-chronological
 * list. Never company/project request administration — that lives on the
 * separate Project Manager-facing Project Requests page (Part 16).
 * Notification link_paths from 20260902170000's migration land here with
 * `?type=leave|absence&id=…`, which highlights the matching row.
 */
export default async function AccountRequestsPage({ searchParams }: AccountRequestsPageProps) {
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);
  const [t, format, { type: highlightType, id: highlightId }] = await Promise.all([getTranslations("Account"), getFormatter(), searchParams]);

  if (!currentCompanyId) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title={t("tabRequests")} />
        <EmptyState icon={CalendarClock} title={t("noCompanyTitle")} description={t("noCompanyDescription")} className="flex-1" />
      </div>
    );
  }

  const myEmployeeId = await getMyEmployeeId(currentCompanyId, user.id);
  const showRates = Boolean(myEmployeeId);

  if (!myEmployeeId) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title={t("tabRequests")} description={t("description")} />
        <AccountSubnav active="requests" showRates={showRates} />
        <EmptyState icon={CalendarClock} title={t("noEmployeeRecordTitle")} description={t("noEmployeeRecordDescription")} className="flex-1" />
      </div>
    );
  }

  const [leaveRequests, absenceReports] = await Promise.all([listMyLeaveRequests(currentCompanyId, myEmployeeId), listMyAbsenceReports(currentCompanyId, myEmployeeId)]);
  const deciderIds = [...leaveRequests.map((r) => r.decided_by), absenceReports.map((r) => r.reviewed_by)].flat().filter((id): id is string => Boolean(id));
  const deciderNames = await resolveDeciderNames(currentCompanyId, deciderIds);

  type Row = {
    key: string;
    kind: "leave" | "absence";
    typeLabel: string;
    dateLabel: string;
    submittedLabel: string;
    status: string;
    statusLabel: string;
    reviewerName: string | null;
    comment: string | null;
    highlighted: boolean;
  };

  const rows: Row[] = [
    ...leaveRequests.map(
      (r): Row => ({
        key: `leave-${r.id}`,
        kind: "leave",
        typeLabel: LEAVE_TYPE_LABELS[r.leave_type],
        dateLabel: `${format.dateTime(new Date(`${r.start_date}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })} – ${format.dateTime(new Date(`${r.end_date}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })}`,
        submittedLabel: format.dateTime(new Date(r.requested_at), { dateStyle: "medium", timeStyle: "short" }),
        status: r.status,
        statusLabel: LEAVE_REQUEST_STATUS_LABELS[r.status],
        reviewerName: r.decided_by ? (deciderNames.get(r.decided_by) ?? null) : null,
        comment: r.management_comment ?? r.employee_comment ?? null,
        highlighted: highlightType === "leave" && highlightId === r.id,
      }),
    ),
    ...absenceReports.map(
      (r): Row => ({
        key: `absence-${r.id}`,
        kind: "absence",
        typeLabel: ABSENCE_REPORT_REASON_LABELS[r.reason],
        dateLabel: format.dateTime(new Date(`${r.work_date}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" }),
        submittedLabel: format.dateTime(new Date(r.reported_at), { dateStyle: "medium", timeStyle: "short" }),
        status: r.status,
        statusLabel: ABSENCE_REPORT_STATUS_LABELS[r.status],
        reviewerName: r.reviewed_by ? (deciderNames.get(r.reviewed_by) ?? null) : null,
        comment: r.review_note ?? r.comment ?? null,
        highlighted: highlightType === "absence" && highlightId === r.id,
      }),
    ),
  ].sort((a, b) => b.submittedLabel.localeCompare(a.submittedLabel));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title={t("tabRequests")} description={t("requestsDescription")} />
      <AccountSubnav active="requests" showRates={showRates} />

      {rows.length === 0 ? (
        <EmptyState icon={CalendarClock} title={t("noRequestsTitle")} description={t("noRequestsDescription")} className="flex-1" />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <Card key={row.key} className={row.highlighted ? "border-primary ring-1 ring-primary" : undefined}>
              <CardContent className="flex flex-col gap-1.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {row.kind === "leave" ? t("requestTypeLeave") : t("requestTypeAbsence")} · {row.typeLabel}
                  </span>
                  <Badge className={STATUS_TONE[row.status] ?? "bg-muted text-muted-foreground"}>{row.statusLabel}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{row.dateLabel}</p>
                <p className="text-xs text-muted-foreground">{t("submittedOn", { date: row.submittedLabel })}</p>
                {row.reviewerName && (
                  <p className="text-xs text-muted-foreground">
                    {t("reviewedBy", { name: row.reviewerName })}
                    {row.comment ? ` — ${row.comment}` : ""}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
