import { CalendarPlus, CalendarOff } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { resolveCurrentProject } from "@/modules/projects/queries";
import { getMyEmployeeId } from "@/modules/daily-workforce/queries";
import { listMyLeaveRequests } from "@/modules/leave-requests/queries";
import { LEAVE_TYPE_LABELS, LEAVE_REQUEST_STATUS_LABELS, countLeaveCalendarDays } from "@/modules/leave-requests/types";
import { RequestLeaveDialog } from "@/modules/leave-requests/components/request-leave-dialog";
import { CancelLeaveButton } from "@/modules/leave-requests/components/cancel-leave-button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

function statusBadgeVariant(status: string): "secondary" | "outline" | "destructive" | "default" {
  if (status === "approved") return "default";
  if (status === "denied") return "destructive";
  if (status === "cancelled") return "secondary";
  return "outline";
}

/** Employee's own leave requests — "Employee sees only their own leave requests" (Phase 9). Every query here is scoped to the caller's own employeeId. */
export default async function MyLeavePage() {
  const { user } = await requireUser();
  const { companies, currentCompanyId } = await resolveCurrentCompany(user.id);
  const company = companies.find((candidate) => candidate.id === currentCompanyId) ?? companies[0];

  if (!company) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="My Leave" />
        <EmptyState icon={CalendarOff} title="No company selected" className="flex-1" />
      </div>
    );
  }

  const { currentProjectId } = await resolveCurrentProject(user.id, company.id);
  const myEmployeeId = currentProjectId ? await getMyEmployeeId(company.id, user.id) : null;

  if (!currentProjectId || !myEmployeeId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="My Leave" />
        <EmptyState icon={CalendarOff} title="No linked employee record" description="Leave requests require a project and an employee record linked to your account." className="flex-1" />
      </div>
    );
  }

  const requests = await listMyLeaveRequests(company.id, myEmployeeId);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="My Leave" description="Your holiday and leave requests." actions={<RequestLeaveDialog companyId={company.id} projectId={currentProjectId} />} />

      {requests.length === 0 ? (
        <EmptyState icon={CalendarPlus} title="No leave requests yet" description="Use Request Holiday to submit one." className="flex-1" />
      ) : (
        <div className="flex flex-col gap-2">
          {requests.map((request) => (
            <Card key={request.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {LEAVE_TYPE_LABELS[request.leave_type]} — {request.start_date} to {request.end_date} ({countLeaveCalendarDays(request.start_date, request.end_date)}d)
                  </span>
                  {request.employee_comment && <span className="text-xs text-muted-foreground">{request.employee_comment}</span>}
                  {request.management_comment && <span className="text-xs text-muted-foreground">Management: {request.management_comment}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusBadgeVariant(request.status)}>{LEAVE_REQUEST_STATUS_LABELS[request.status]}</Badge>
                  {request.status === "returned" && (
                    <RequestLeaveDialog companyId={company.id} projectId={currentProjectId} resubmitTarget={request} />
                  )}
                  {(request.status === "pending" || request.status === "returned" || (request.status === "approved" && request.end_date >= new Date().toISOString().slice(0, 10))) && (
                    <CancelLeaveButton companyId={company.id} projectId={currentProjectId} leaveRequestId={request.id} />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
