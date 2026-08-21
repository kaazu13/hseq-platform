import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CalendarOff } from "lucide-react";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames, isPlatformSuperAdmin } from "@/lib/auth/session";
import { getProject, getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { canManageDailyWorkforce, canViewDailyWorkforceBroadly } from "@/modules/daily-workforce/permissions";
import { DailyWorkforceSubnav } from "@/modules/daily-workforce/components/daily-workforce-subnav";
import { listLeaveRequestsForProject } from "@/modules/leave-requests/queries";
import { LEAVE_TYPE_LABELS, LEAVE_REQUEST_STATUS_LABELS, countLeaveCalendarDays, type LeaveRequestStatus } from "@/modules/leave-requests/types";
import { LeaveRequestDecisionControls } from "@/modules/leave-requests/components/leave-request-decision-controls";
import { LeaveExportDialog } from "@/modules/leave-requests/components/leave-export-dialog";
import { LeaveRequestFilters } from "@/modules/leave-requests/components/leave-request-filters";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type LeavePageProps = {
  params: Promise<{ companyId: string; projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

const STATUS_TAB_KEYS: (LeaveRequestStatus | "all")[] = ["pending", "approved", "returned", "denied", "all"];

function statusBadgeVariant(status: string): "secondary" | "outline" | "destructive" | "default" {
  if (status === "approved") return "default";
  if (status === "denied") return "destructive";
  if (status === "cancelled") return "secondary";
  return "outline";
}

/**
 * Holiday/Leave management view (Phase 9) — Pending/Approved/Returned/
 * Denied/History, scoped to this project.
 *
 * Route fix (manual-testing regression): this page used to 404 for any
 * "broad viewer" role (project_manager not the project's own assigned PM,
 * hseq_manager, hse_officer, foreman) even though DailyWorkforceSubnav
 * shows the "Holiday / Leave" tab to that exact same audience on every
 * sibling page (Teams/Workforce/Absent Today) — clicking the tab landed
 * on a 404 that looked like a broken/renamed route, when the route itself
 * was correct all along. Now matches its siblings' own gate exactly:
 * canManage OR canViewBroadly may view the page; only canManage sees the
 * approve/deny controls and the export button (decision authority is
 * unchanged — see LeaveRequestDecisionControls/LeaveExportDialog below).
 */
export default async function LeavePage({ params, searchParams }: LeavePageProps) {
  const { companyId, projectId } = await params;
  const urlParams = await searchParams;
  const { user } = await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const project = await getProject(companyId, projectId);
  if (!project) notFound();

  const [roleNames, myProjectRoles, isSuperAdmin] = await Promise.all([getUserRoleNames(companyId), getMyProjectAssignmentRoles(companyId, projectId, user.id), isPlatformSuperAdmin()]);
  const canManage = isSuperAdmin || canManageDailyWorkforce(roleNames, myProjectRoles);
  const canViewBroadly = isSuperAdmin || canViewDailyWorkforceBroadly(roleNames, true);
  if (!canManage && !canViewBroadly) notFound();

  const activeTab = STATUS_TAB_KEYS.includes((urlParams.status ?? "") as (typeof STATUS_TAB_KEYS)[number]) ? (urlParams.status as (typeof STATUS_TAB_KEYS)[number]) : "pending";
  const allRequests = await listLeaveRequestsForProject(companyId, projectId, {
    statuses: activeTab === "all" ? undefined : [activeTab as LeaveRequestStatus],
    fromDate: urlParams.from || undefined,
    toDate: urlParams.to || undefined,
  });

  // Part 30 — employee search + type, filtered in JS over the already
  // status/date-scoped result set (a small, bounded per-project list —
  // never a second query, matching the query layer's existing shape).
  const employeeSearch = urlParams.employee?.trim().toLowerCase();
  const typeFilter = urlParams.type;
  const requests = allRequests
    .filter((request) => !employeeSearch || `${request.employee.first_name} ${request.employee.last_name}`.toLowerCase().includes(employeeSearch))
    .filter((request) => !typeFilter || typeFilter === "all" || request.leave_type === typeFilter);

  const basePath = `/companies/${companyId}/projects/${projectId}/leave`;
  const t = await getTranslations("LeaveManagement");

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title={t("title")} description={project.name} actions={canManage ? <LeaveExportDialog companyId={companyId} projectId={projectId} /> : undefined} />

      <DailyWorkforceSubnav companyId={companyId} projectId={projectId} active="leave" />

      <div className="flex items-center gap-1 overflow-x-auto border-b">
        {STATUS_TAB_KEYS.map((key) => (
          <Link
            key={key}
            href={`${basePath}?status=${key}`}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              activeTab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`tabs.${key}`)}
          </Link>
        ))}
      </div>

      <LeaveRequestFilters />

      {requests.length === 0 ? (
        <EmptyState icon={CalendarOff} title={t("noRequestsTitle")} />
      ) : (
        <div className="flex flex-col gap-2">
          {requests.map((request) => (
            <Card key={request.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {request.employee.first_name} {request.employee.last_name} — {LEAVE_TYPE_LABELS[request.leave_type]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("dateRange", { start: request.start_date, end: request.end_date, days: countLeaveCalendarDays(request.start_date, request.end_date) })}
                    {request.employee_comment ? ` — "${request.employee_comment}"` : ""}
                  </span>
                  {request.management_comment && <span className="text-xs text-muted-foreground">{t("managementComment", { comment: request.management_comment })}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusBadgeVariant(request.status)}>{LEAVE_REQUEST_STATUS_LABELS[request.status]}</Badge>
                  {canManage && request.status === "pending" && <LeaveRequestDecisionControls companyId={companyId} projectId={projectId} leaveRequestId={request.id} />}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
