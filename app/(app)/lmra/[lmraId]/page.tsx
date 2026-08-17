import Link from "next/link";
import { notFound, forbidden } from "next/navigation";
import { Pencil } from "lucide-react";
import { requireUser, getUserRoleNames, isPlatformSuperAdmin } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getProject } from "@/modules/projects/queries";
import { getLmraAssessment, isCallerProjectForeman, listLmraCandidateEmployees, getMyEmployeeId } from "@/modules/lmra/queries";
import { canManageLmra, canArchiveLmra, canReviewLmra } from "@/modules/lmra/permissions";
import { lmraHazardInputsFromRows, LMRA_SHIFT_LABELS, formatLmraReference } from "@/modules/lmra/types";
import { LmraStatusBadge } from "@/modules/lmra/components/lmra-status-badge";
import { LmraResultBadge } from "@/modules/lmra/components/lmra-result-badge";
import { LmraHazardsAndControls } from "@/modules/lmra/components/lmra-hazards-and-controls";
import { LmraWorkersSection } from "@/modules/lmra/components/lmra-workers-section";
import { LmraSubmitCard } from "@/modules/lmra/components/lmra-submit-card";
import { LmraReviewCard } from "@/modules/lmra/components/lmra-review-card";
import { LmraDetailActions } from "@/modules/lmra/components/lmra-detail-actions";
import { toEmployeeOptions } from "@/modules/employees/employee-options";
import { listReportSharesForRecord } from "@/modules/reports/queries";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type LmraDetailPageProps = {
  params: Promise<{ lmraId: string }>;
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * LMRA detail / report page (Phase 8) — the canonical view every create/
 * edit redirect lands on, and the foundation for future PDF/share output.
 * Also the print view (globals.css's `@media print` rules + `print:hidden`
 * on anything interactive), unchanged from before this redesign.
 *
 * `created_by`/`submitted_by`/`reviewed_by`/`archived_by` are shown as
 * timestamps only, never resolved to a display name — same documented
 * limitation as before this redesign (no bulk actor-name-resolution path
 * exists yet).
 */
export default async function LmraDetailPage({ params }: LmraDetailPageProps) {
  const { lmraId } = await params;
  const { user } = await requireUser();
  const { currentCompanyId, companies } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    forbidden();
  }

  const assessment = await getLmraAssessment(currentCompanyId, lmraId);
  if (!assessment) {
    notFound();
  }

  const [roleNames, isForeman, myEmployeeId, project, isSuperAdmin] = await Promise.all([
    getUserRoleNames(currentCompanyId),
    isCallerProjectForeman(currentCompanyId, assessment.project_id, user.id),
    getMyEmployeeId(currentCompanyId, user.id),
    getProject(currentCompanyId, assessment.project_id),
    isPlatformSuperAdmin(),
  ]);

  // `project` can legitimately be null here even though the assessment
  // itself is visible: lmra_assessments_select grants hseq_manager
  // company-wide read access, but projects_select does NOT extend the same
  // company-wide grant to hseq_manager — an HSE Manager with no direct
  // assignment on THIS project can see the LMRA but not the project row it
  // belongs to. Degrade gracefully rather than 404ing a record the viewer
  // is genuinely allowed to see.
  const projectName = project?.name ?? "Project unavailable";
  const companyName = companies.find((company) => company.id === currentCompanyId)?.name ?? "—";

  const isOwnAssessment = Boolean(myEmployeeId && assessment.completed_by_employee_id === myEmployeeId);
  const canManage = canManageLmra(roleNames, isForeman, isOwnAssessment);
  const canReview = isSuperAdmin || canReviewLmra(roleNames, isForeman);
  const canArchive = canArchiveLmra(roleNames);
  const candidateRows = await listLmraCandidateEmployees(currentCompanyId, assessment.project_id);
  const candidates = toEmployeeOptions(candidateRows);
  const reference = formatLmraReference(assessment);
  const shares = canManage ? await listReportSharesForRecord(currentCompanyId, "lmra", assessment.id) : [];

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6 print:p-0">
      <PageHeader
        title={assessment.work_activity}
        description={`${reference} · ${projectName} · ${assessment.work_area}`}
        actions={
          <>
            {canManage && assessment.status !== "archived" && (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/lmra/${assessment.id}/edit`} />} className="print:hidden">
                <Pencil />
                Edit
              </Button>
            )}
            <LmraDetailActions
              companyId={currentCompanyId}
              lmraId={assessment.id}
              projectId={assessment.project_id}
              canReopen={canReview && (assessment.status === "approved" || assessment.status === "rejected")}
              canArchive={canArchive && assessment.status !== "archived"}
              canShare={canManage}
              initialShares={shares}
            />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <LmraStatusBadge status={assessment.status} />
        {assessment.status !== "draft" && <LmraResultBadge result={assessment.result} />}
        <span className="text-sm text-muted-foreground">
          {formatDate(assessment.work_date)} · {LMRA_SHIFT_LABELS[assessment.shift]}
        </span>
      </div>

      {assessment.result === "no_go" && assessment.stop_work_reason && (
        <Card className="border-destructive/40">
          <CardContent className="pt-4">
            <p className="text-sm font-medium text-destructive">Stop-work reason</p>
            <p className="text-sm">{assessment.stop_work_reason}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Reference</p>
            <p className="text-sm">{reference}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Company</p>
            <p className="text-sm">{companyName}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Project</p>
            <p className="text-sm">{projectName}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Date / shift</p>
            <p className="text-sm">
              {formatDate(assessment.work_date)} · {LMRA_SHIFT_LABELS[assessment.shift]}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Work area</p>
            <p className="text-sm">{assessment.work_area}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Work activity</p>
            <p className="text-sm">{assessment.work_activity}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">LMRA completed by</p>
            <p className="text-sm">{assessment.completedBy ? `${assessment.completedBy.first_name} ${assessment.completedBy.last_name}` : "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Person responsible for the work</p>
            <p className="text-sm">{assessment.responsiblePerson ? `${assessment.responsiblePerson.first_name} ${assessment.responsiblePerson.last_name}` : "Not set"}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Created</p>
            <p className="text-sm">{formatDateTime(assessment.created_at)}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Last updated</p>
            <p className="text-sm">{formatDateTime(assessment.updated_at)}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Submitted</p>
            <p className="text-sm">{formatDateTime(assessment.submitted_at)}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Reviewed</p>
            <p className="text-sm">{formatDateTime(assessment.reviewed_at)}</p>
          </div>
          {assessment.review_notes && (
            <div className="sm:col-span-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Review notes</p>
              <p className="text-sm">{assessment.review_notes}</p>
            </div>
          )}
          {assessment.notes && (
            <div className="sm:col-span-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Notes</p>
              <p className="text-sm">{assessment.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <LmraWorkersSection
        companyId={currentCompanyId}
        projectId={assessment.project_id}
        workDate={assessment.work_date}
        options={candidates}
        selectedIds={assessment.participants.map((participant) => participant.employee_id)}
        readOnly
      />

      <div className="flex flex-col gap-3">
        <SectionHeader title="Hazards & control measures" />
        <LmraHazardsAndControls rows={lmraHazardInputsFromRows(assessment.hazards)} candidates={candidates} readOnly />
      </div>

      {canManage && assessment.status === "draft" && (
        <div className="print:hidden">
          <LmraSubmitCard companyId={currentCompanyId} lmraId={assessment.id} projectId={assessment.project_id} />
        </div>
      )}

      {canReview && assessment.status === "submitted" && (
        <div className="print:hidden">
          <LmraReviewCard companyId={currentCompanyId} lmraId={assessment.id} projectId={assessment.project_id} />
        </div>
      )}
    </div>
  );
}
