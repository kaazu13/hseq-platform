import Link from "next/link";
import { notFound, forbidden } from "next/navigation";
import { Pencil } from "lucide-react";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentOrganization } from "@/modules/organizations/queries";
import { getProject } from "@/modules/projects/queries";
import { getLmraAssessment, isCallerProjectForeman, listLmraCandidateEmployees } from "@/modules/lmra/queries";
import { canManageLmra, canArchiveLmra } from "@/modules/lmra/permissions";
import { LmraStatusBadge } from "@/modules/lmra/components/lmra-status-badge";
import { LmraResultBadge } from "@/modules/lmra/components/lmra-result-badge";
import { LmraHazardChecklist } from "@/modules/lmra/components/lmra-hazard-checklist";
import { LmraParticipantsPicker } from "@/modules/lmra/components/lmra-participants-picker";
import { LmraSubmitCard } from "@/modules/lmra/components/lmra-submit-card";
import { LmraReviewCard } from "@/modules/lmra/components/lmra-review-card";
import { LmraDetailActions } from "@/modules/lmra/components/lmra-detail-actions";
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
 * LMRA detail — view, review/approve, reopen, archive, and print, all from
 * one route (docs' "printable LMRA detail pages" requirement: this same
 * page IS the print view, via globals.css's `@media print` rules and
 * `print:hidden` on anything interactive — not a separate route).
 *
 * `created_by`/`submitted_by`/`reviewed_by`/`archived_by` are shown as
 * timestamps only, never resolved to a display name — same documented
 * limitation as modules/employees/queries.ts's listEmploymentPeriods
 * (`profiles` RLS only lets a user read their own row; there is no bulk
 * name-resolution path for arbitrary actor ids anywhere in this codebase
 * yet, and widening that is a separate product/privacy decision).
 */
export default async function LmraDetailPage({ params }: LmraDetailPageProps) {
  const { lmraId } = await params;
  const { user } = await requireUser();
  const { currentOrganizationId } = await resolveCurrentOrganization(user.id);

  if (!currentOrganizationId) {
    forbidden();
  }

  const assessment = await getLmraAssessment(currentOrganizationId, lmraId);
  if (!assessment) {
    notFound();
  }

  const [roleNames, isForeman, project] = await Promise.all([
    getUserRoleNames(currentOrganizationId),
    isCallerProjectForeman(currentOrganizationId, assessment.project_id, user.id),
    getProject(currentOrganizationId, assessment.project_id),
  ]);

  // `project` can legitimately be null here even though the assessment
  // itself is visible: lmra_assessments_select grants hseq_manager
  // org-wide read access, but projects_select does NOT extend the same
  // org-wide grant to hseq_manager (only company_admin/operations_manager
  // — see supabase/migrations/20260728090000_projects_and_teams.sql's
  // projects_select policy) — an HSE Manager with no direct assignment on
  // THIS project can see the LMRA but not the project row it belongs to.
  // Degrade gracefully rather than 404ing a record the viewer is genuinely
  // allowed to see.
  const projectName = project?.name ?? "Project unavailable";

  const canManage = canManageLmra(roleNames, isForeman);
  const canArchive = canArchiveLmra(roleNames);
  const candidates = await listLmraCandidateEmployees(currentOrganizationId, assessment.project_id);

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6 print:p-0">
      <PageHeader
        title={assessment.work_activity}
        description={`${projectName} · ${assessment.work_area}`}
        actions={
          <>
            {canManage && assessment.status !== "archived" && (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/lmra/${assessment.id}/edit`} />} className="print:hidden">
                <Pencil />
                Edit
              </Button>
            )}
            <LmraDetailActions
              organizationId={currentOrganizationId}
              lmraId={assessment.id}
              projectId={assessment.project_id}
              canReopen={canManage && (assessment.status === "approved" || assessment.status === "rejected")}
              canArchive={canArchive && assessment.status !== "archived"}
            />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <LmraStatusBadge status={assessment.status} />
        {assessment.status !== "draft" && <LmraResultBadge result={assessment.result} />}
        <span className="text-sm text-muted-foreground">{formatDate(assessment.work_date)} · {assessment.shift} shift</span>
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
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Project</p>
            <p className="text-sm">{projectName}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Responsible foreman</p>
            <p className="text-sm">{assessment.foreman ? `${assessment.foreman.first_name} ${assessment.foreman.last_name}` : "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Created</p>
            <p className="text-sm">{formatDateTime(assessment.created_at)}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Submitted</p>
            <p className="text-sm">{formatDateTime(assessment.submitted_at)}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Reviewed</p>
            <p className="text-sm">{formatDateTime(assessment.reviewed_at)}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Approved</p>
            <p className="text-sm">{formatDateTime(assessment.approved_at)}</p>
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

      <div className="flex flex-col gap-3">
        <SectionHeader title="Hazard checklist" />
        <LmraHazardChecklist
          organizationId={currentOrganizationId}
          lmraId={assessment.id}
          projectId={assessment.project_id}
          hazards={assessment.hazards}
          candidates={candidates}
          readOnly
        />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeader title="Workers involved" />
        <LmraParticipantsPicker
          organizationId={currentOrganizationId}
          lmraId={assessment.id}
          projectId={assessment.project_id}
          candidates={candidates}
          currentParticipantIds={assessment.participants.map((participant) => participant.employee_id)}
          readOnly
        />
      </div>

      {canManage && assessment.status === "draft" && (
        <div className="print:hidden">
          <LmraSubmitCard organizationId={currentOrganizationId} lmraId={assessment.id} projectId={assessment.project_id} />
        </div>
      )}

      {canManage && assessment.status === "submitted" && (
        <div className="print:hidden">
          <LmraReviewCard organizationId={currentOrganizationId} lmraId={assessment.id} projectId={assessment.project_id} />
        </div>
      )}
    </div>
  );
}

