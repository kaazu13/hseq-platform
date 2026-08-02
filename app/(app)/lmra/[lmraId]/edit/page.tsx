import { forbidden, notFound } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentOrganization } from "@/modules/organizations/queries";
import { getProject } from "@/modules/projects/queries";
import { getLmraAssessment, isCallerProjectForeman, listLmraCandidateEmployees } from "@/modules/lmra/queries";
import { canManageLmra } from "@/modules/lmra/permissions";
import { LmraAssessmentForm } from "@/modules/lmra/components/lmra-assessment-form";
import { LmraHazardChecklist } from "@/modules/lmra/components/lmra-hazard-checklist";
import { LmraParticipantsPicker } from "@/modules/lmra/components/lmra-participants-picker";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";

type EditLmraPageProps = {
  params: Promise<{ lmraId: string }>;
};

/**
 * Edit surface — core fields, the 12-hazard checklist, and the worker
 * picker, all on one scrolling page (docs/UI_GUIDELINES.md §4's field-facing
 * form guidance, simplified from a full stepper to sections given this
 * milestone's scope — see the implementation report). Submit/review/
 * approve/archive are separate, explicit actions on the detail page, not
 * here — this page only ever changes content.
 *
 * Hazards/participants are draft-only at the database level
 * (assert_lmra_assessment_is_draft() — see the migration); once submitted
 * they render read-only here with an explanatory note rather than letting a
 * save attempt fail. Core fields have no such restriction (only 'archived'
 * is a hard stop), so they stay editable regardless of status.
 */
export default async function EditLmraPage({ params }: EditLmraPageProps) {
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
  if (assessment.status === "archived") {
    forbidden();
  }

  const [roleNames, isForeman, project] = await Promise.all([
    getUserRoleNames(currentOrganizationId),
    isCallerProjectForeman(currentOrganizationId, assessment.project_id, user.id),
    getProject(currentOrganizationId, assessment.project_id),
  ]);

  if (!canManageLmra(roleNames, isForeman)) {
    forbidden();
  }

  // `project` can legitimately be null even though the caller can manage
  // this assessment — see app/(app)/lmra/[lmraId]/page.tsx's comment on the
  // same lookup: projects_select doesn't grant hseq_manager org-wide
  // visibility the way lmra_assessments_select does. Degrade gracefully
  // rather than 404ing a record this HSE Manager is genuinely allowed to
  // edit.
  const projectName = project?.name ?? "Project unavailable";

  const candidates = await listLmraCandidateEmployees(currentOrganizationId, assessment.project_id);
  const hazardsEditable = assessment.status === "draft";

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6">
      <PageHeader title="Edit LMRA" description={`${projectName} · ${assessment.work_activity}`} />

      <div className="max-w-3xl">
        <LmraAssessmentForm mode="edit" organizationId={currentOrganizationId} projectId={assessment.project_id} projectName={projectName} candidates={candidates} assessment={assessment} />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeader title="Hazard checklist" description={hazardsEditable ? undefined : "Read-only — reopen this LMRA to a draft to make changes."} />
        <LmraHazardChecklist
          organizationId={currentOrganizationId}
          lmraId={assessment.id}
          projectId={assessment.project_id}
          hazards={assessment.hazards}
          candidates={candidates}
          readOnly={!hazardsEditable}
        />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeader title="Workers involved" description={hazardsEditable ? undefined : "Read-only — reopen this LMRA to a draft to make changes."} />
        <LmraParticipantsPicker
          organizationId={currentOrganizationId}
          lmraId={assessment.id}
          projectId={assessment.project_id}
          candidates={candidates}
          currentParticipantIds={assessment.participants.map((participant) => participant.employee_id)}
          readOnly={!hazardsEditable}
        />
      </div>
    </div>
  );
}
