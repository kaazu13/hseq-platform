import Link from "next/link";
import { forbidden } from "next/navigation";
import { getFormatter } from "next-intl/server";
import { Wallet } from "lucide-react";
import { requireUser, getUserRoleNames, isPlatformSuperAdmin } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { listCompanyRateRequests } from "@/modules/rate-requests/queries";
import { EMPLOYEE_RATE_REQUEST_STATUS_LABELS, type EmployeeRateRequestStatus } from "@/modules/rate-requests/types";
import { canReviewRateRequests, canReadProjectRateRequests } from "@/modules/rate-requests/permissions";
import { getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { listProjects } from "@/modules/projects/queries";
import { RateRequestDecisionControls } from "@/modules/rate-requests/components/rate-request-decision-controls";
import { getProjectLocalDate } from "@/lib/project-date";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type RateRequestsPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

const STATUS_TABS: (EmployeeRateRequestStatus | "all")[] = ["pending", "approved", "rejected", "all"];

/**
 * Part 7 — dedicated Rate Requests administration page (People and
 * Administration group, never buried inside Equipment/Worked Hours).
 * company_admin/planner/platform_super_admin get full decision controls;
 * a project_manager reaches this same page but sees a READ-ONLY list
 * (no RateRequestDecisionControls rendered at all for them) scoped by
 * RLS itself to employees in their own project(s) — the query never
 * re-derives that scoping.
 */
export default async function RateRequestsPage({ searchParams }: RateRequestsPageProps) {
  const urlParams = await searchParams;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="Rate Requests" />
        <EmptyState icon={Wallet} title="No company selected" className="flex-1" />
      </div>
    );
  }

  const [roleNames, isSuperAdmin, projects] = await Promise.all([getUserRoleNames(currentCompanyId), isPlatformSuperAdmin(), listProjects(currentCompanyId)]);
  const canReview = canReviewRateRequests(roleNames, isSuperAdmin);

  // A project_manager's read-only eligibility is per-project (their OWN
  // assigned project(s)) — check across every project they're on, not
  // just one; RLS itself performs the real per-row scoping either way.
  let canReadAnyProject = false;
  if (!canReview) {
    for (const project of projects) {
      const myRoles = await getMyProjectAssignmentRoles(currentCompanyId, project.id, user.id);
      if (canReadProjectRateRequests(myRoles)) {
        canReadAnyProject = true;
        break;
      }
    }
  }
  if (!canReview && !canReadAnyProject) forbidden();

  const activeTab = STATUS_TABS.includes((urlParams.status ?? "") as (typeof STATUS_TABS)[number]) ? (urlParams.status as (typeof STATUS_TABS)[number]) : "pending";
  const format = await getFormatter();
  const todayDate = getProjectLocalDate(null);

  const requests = await listCompanyRateRequests(currentCompanyId, {
    status: activeTab === "all" ? undefined : activeTab,
    employeeSearch: urlParams.employee,
    fromDate: urlParams.from,
    toDate: urlParams.to,
  });

  const basePath = "/rate-requests";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Rate Requests" description={canReview ? "Approve or reject employee rate review requests." : "Read-only view of rate requests for employees in your project(s)."} />

      <div className="flex items-center gap-1 overflow-x-auto border-b">
        {STATUS_TABS.map((key) => (
          <Link
            key={key}
            href={`${basePath}?status=${key}`}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              activeTab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {key === "all" ? "All" : EMPLOYEE_RATE_REQUEST_STATUS_LABELS[key]}
          </Link>
        ))}
      </div>

      {requests.length === 0 ? (
        <EmptyState icon={Wallet} title="No rate requests" description="Requests matching this filter will appear here." className="flex-1" />
      ) : (
        <div className="flex flex-col gap-2">
          {requests.map((request) => (
            <Card key={request.id}>
              <CardContent className="flex flex-col gap-2 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {request.employee.first_name} {request.employee.last_name}
                    {request.projectNames.length > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{request.projectNames.join(", ")}</span>}
                  </span>
                  <Badge variant={request.status === "approved" ? "default" : request.status === "rejected" ? "destructive" : "secondary"}>{EMPLOYEE_RATE_REQUEST_STATUS_LABELS[request.status]}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>Current: {request.current_rate_at_request != null ? format.number(request.current_rate_at_request, { style: "currency", currency: request.currency }) : "—"}</span>
                  <span>Requested: {request.requested_rate != null ? format.number(request.requested_rate, { style: "currency", currency: request.currency }) : "Review only, no amount specified"}</span>
                  <span>Submitted {format.dateTime(new Date(request.submitted_at), { dateStyle: "medium" })}</span>
                </div>
                {request.reason && <p className="text-sm">{request.reason}</p>}
                {request.status !== "pending" && request.decision_reason && (
                  <p className="text-sm text-muted-foreground">
                    Decision: {request.decision_reason}
                    {request.approved_rate != null && ` — ${format.number(request.approved_rate, { style: "currency", currency: request.currency })}`}
                  </p>
                )}
                {canReview && request.status === "pending" && (
                  <RateRequestDecisionControls companyId={currentCompanyId} requestId={request.id} requestedRate={request.requested_rate} currency={request.currency} todayDate={todayDate} />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
