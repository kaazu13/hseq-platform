import Link from "next/link";
import { notFound, forbidden } from "next/navigation";
import { Pencil } from "lucide-react";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentOrganization } from "@/modules/organizations/queries";
import { getProject } from "@/modules/projects/queries";
import { getObservation, isCallerProjectAccessible, listObservationCandidateEmployees } from "@/modules/observations/queries";
import { canEditObservation, canReviewOrCloseObservation } from "@/modules/observations/permissions";
import { listCorrectiveActionsForObservation, isCallerProjectManager, listCorrectiveActionCandidateEmployees } from "@/modules/corrective-actions/queries";
import { canCreateCorrectiveAction, canManageCorrectiveActionDetails } from "@/modules/corrective-actions/permissions";
import { hasUnresolvedCorrectiveActions } from "@/modules/corrective-actions/types";
import { ObservationStatusBadge } from "@/modules/observations/components/observation-status-badge";
import { ObservationCategoryBadge } from "@/modules/observations/components/observation-category-badge";
import { ObservationRiskBadge } from "@/modules/observations/components/observation-risk-badge";
import { ObservationParticipantsPicker } from "@/modules/observations/components/observation-participants-picker";
import { ObservationReviewCloseCard } from "@/modules/observations/components/observation-review-close-card";
import { ObservationPrintButton } from "@/modules/observations/components/observation-print-button";
import { CorrectiveActionsSection } from "@/modules/corrective-actions/components/corrective-actions-section";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ObservationDetailPageProps = {
  params: Promise<{ observationId: string }>;
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Observation detail — view, edit link, review/close, corrective-action
 * management, and print, all from one route (this same page IS the print
 * view, via `print:hidden` on anything interactive — same convention as
 * app/(app)/lmra/[lmraId]/page.tsx).
 *
 * `created_by`/`reviewed_by`/`closed_by` are shown as timestamps only,
 * never resolved to a display name — same documented limitation as
 * modules/lmra's detail page (no bulk actor-name-resolution path exists
 * anywhere in this codebase yet). This satisfies "show full history
 * without exposing sensitive data to unauthorized users" by construction:
 * nothing here exposes anything beyond what RLS already scoped this exact
 * query to.
 */
export default async function ObservationDetailPage({ params }: ObservationDetailPageProps) {
  const { observationId } = await params;
  const { user } = await requireUser();
  const { currentOrganizationId } = await resolveCurrentOrganization(user.id);

  if (!currentOrganizationId) {
    forbidden();
  }

  const observation = await getObservation(currentOrganizationId, observationId);
  if (!observation) {
    notFound();
  }

  const [roleNames, hasProjectAccess, isProjectManager, project, correctiveActions] = await Promise.all([
    getUserRoleNames(currentOrganizationId),
    isCallerProjectAccessible(observation.project_id),
    isCallerProjectManager(observation.project_id),
    getProject(currentOrganizationId, observation.project_id),
    listCorrectiveActionsForObservation(currentOrganizationId, observation.id),
  ]);

  // `project` can legitimately be null even though the observation itself
  // is visible — see app/(app)/lmra/[lmraId]/page.tsx's comment on the
  // identical projects_select-vs-module-RLS gap. Degrade gracefully.
  const projectName = project?.name ?? "Project unavailable";

  const canEdit = canEditObservation(roleNames, hasProjectAccess, observation.created_by === user.id);
  const canReviewOrClose = canReviewOrCloseObservation(roleNames);
  const canCreateAction = canCreateCorrectiveAction(roleNames, isProjectManager, hasProjectAccess) && observation.status === "open";
  const canManageActionDetails = canManageCorrectiveActionDetails(roleNames, isProjectManager, hasProjectAccess);

  const candidates = await listObservationCandidateEmployees(currentOrganizationId, observation.project_id);
  const actionCandidates = await listCorrectiveActionCandidateEmployees(currentOrganizationId, observation.project_id);

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6 print:p-0">
      <PageHeader
        title={observation.description}
        description={`${projectName} · ${observation.work_area}`}
        actions={
          <>
            {canEdit && observation.status === "open" && (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/observations/${observation.id}/edit`} />} className="print:hidden">
                <Pencil />
                Edit
              </Button>
            )}
            <ObservationPrintButton />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <ObservationStatusBadge status={observation.status} />
        <ObservationCategoryBadge category={observation.category} />
        <ObservationRiskBadge riskLevel={observation.risk_level} />
        {observation.is_stop_work && <span className="text-sm font-medium text-destructive">Work was stopped</span>}
        <span className="text-sm text-muted-foreground">{formatDateTime(observation.observed_at)}</span>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Project</p>
            <p className="text-sm">{projectName}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Observer</p>
            <p className="text-sm">{observation.observer ? `${observation.observer.first_name} ${observation.observer.last_name}` : "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Created</p>
            <p className="text-sm">{formatDateTime(observation.created_at)}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Reviewed</p>
            <p className="text-sm">{formatDateTime(observation.reviewed_at)}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Closed</p>
            <p className="text-sm">{formatDateTime(observation.closed_at)}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Description</p>
            <p className="text-sm">{observation.description}</p>
          </div>
          {observation.immediate_action_taken && (
            <div className="sm:col-span-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Immediate action taken</p>
              <p className="text-sm">{observation.immediate_action_taken}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <SectionHeader title="People involved" />
        <ObservationParticipantsPicker
          organizationId={currentOrganizationId}
          observationId={observation.id}
          projectId={observation.project_id}
          createdBy={observation.created_by}
          candidates={candidates}
          currentParticipantIds={observation.participants.map((participant) => participant.employee_id)}
          readOnly
        />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeader title="Corrective actions" />
        <CorrectiveActionsSection
          organizationId={currentOrganizationId}
          observationId={observation.id}
          projectId={observation.project_id}
          actions={correctiveActions}
          candidates={actionCandidates}
          canCreate={canCreateAction}
          canManageDetails={canManageActionDetails}
          roleNames={roleNames}
          isProjectManager={isProjectManager}
          hasProjectAccess={hasProjectAccess}
          currentUserProfileId={user.id}
        />
      </div>

      {canReviewOrClose && observation.status === "open" && (
        <div className="print:hidden">
          <ObservationReviewCloseCard
            organizationId={currentOrganizationId}
            observationId={observation.id}
            reviewedAt={observation.reviewed_at}
            hasUnresolvedActions={hasUnresolvedCorrectiveActions(correctiveActions)}
          />
        </div>
      )}
    </div>
  );
}
