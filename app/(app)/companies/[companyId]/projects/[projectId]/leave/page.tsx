import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarOff } from "lucide-react";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames } from "@/lib/auth/session";
import { getProject, getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { canManageDailyWorkforce } from "@/modules/daily-workforce/permissions";
import { DailyWorkforceSubnav } from "@/modules/daily-workforce/components/daily-workforce-subnav";
import { listLeaveRequestsForProject } from "@/modules/leave-requests/queries";
import { LEAVE_TYPE_LABELS, LEAVE_REQUEST_STATUS_LABELS, countLeaveCalendarDays, type LeaveRequestStatus } from "@/modules/leave-requests/types";
import { LeaveRequestDecisionControls } from "@/modules/leave-requests/components/leave-request-decision-controls";
import { LeaveExportDialog } from "@/modules/leave-requests/components/leave-export-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type LeavePageProps = {
  params: Promise<{ companyId: string; projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

const STATUS_TABS: { key: LeaveRequestStatus | "all"; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "returned", label: "Returned" },
  { key: "denied", label: "Denied" },
  { key: "all", label: "History" },
];

function statusBadgeVariant(status: string): "secondary" | "outline" | "destructive" | "default" {
  if (status === "approved") return "default";
  if (status === "denied") return "destructive";
  if (status === "cancelled") return "secondary";
  return "outline";
}

/** Holiday/Leave management view (Phase 9) — Pending/Approved/Returned/Denied/History, scoped to this project. "Employee sees only their own; authorized management sees only the correct company/project scope" — canManage gates the whole page. */
export default async function LeavePage({ params, searchParams }: LeavePageProps) {
  const { companyId, projectId } = await params;
  const urlParams = await searchParams;
  const { user } = await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const project = await getProject(companyId, projectId);
  if (!project) notFound();

  const [roleNames, myProjectRoles] = await Promise.all([getUserRoleNames(companyId), getMyProjectAssignmentRoles(companyId, projectId, user.id)]);
  const canManage = canManageDailyWorkforce(roleNames, myProjectRoles);
  if (!canManage) notFound();

  const activeTab = STATUS_TABS.find((tab) => tab.key === urlParams.status)?.key ?? "pending";
  const requests = await listLeaveRequestsForProject(companyId, projectId, activeTab === "all" ? undefined : { statuses: [activeTab as LeaveRequestStatus] });

  const basePath = `/companies/${companyId}/projects/${projectId}/leave`;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Holiday / Leave" description={project.name} actions={<LeaveExportDialog companyId={companyId} projectId={projectId} />} />

      <DailyWorkforceSubnav companyId={companyId} projectId={projectId} active="leave" />

      <div className="flex items-center gap-1 overflow-x-auto border-b">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`${basePath}?status=${tab.key}`}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              activeTab === tab.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {requests.length === 0 ? (
        <EmptyState icon={CalendarOff} title="No requests here" />
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
                    {request.start_date} to {request.end_date} ({countLeaveCalendarDays(request.start_date, request.end_date)}d)
                    {request.employee_comment ? ` — “${request.employee_comment}”` : ""}
                  </span>
                  {request.management_comment && <span className="text-xs text-muted-foreground">Management: {request.management_comment}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusBadgeVariant(request.status)}>{LEAVE_REQUEST_STATUS_LABELS[request.status]}</Badge>
                  {request.status === "pending" && <LeaveRequestDecisionControls companyId={companyId} projectId={projectId} leaveRequestId={request.id} />}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
