import { forbidden, notFound } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getProject } from "@/modules/projects/queries";
import { getLmraAssessment, isCallerProjectForeman, listLmraCandidateEmployees, getMyEmployeeId } from "@/modules/lmra/queries";
import { canManageLmra } from "@/modules/lmra/permissions";
import { lmraHazardInputsFromRows } from "@/modules/lmra/types";
import { LmraForm } from "@/modules/lmra/components/lmra-form";
import { toEmployeeOptions } from "@/modules/employees/employee-options";
import { PageHeader } from "@/components/shared/page-header";

type EditLmraPageProps = {
  params: Promise<{ lmraId: string }>;
};

/**
 * Edit surface — the SAME `LmraForm` component the create flow uses
 * (Phase 9: "editing should reuse the same form architecture where
 * practical"), in mode="edit". Core fields stay editable regardless of
 * status (only 'archived' is a hard stop, enforced below); workers/hazards
 * render read-only once the assessment is past draft — reopen it first
 * (the detail page's "Reopen" action) to make further changes there.
 */
export default async function EditLmraPage({ params }: EditLmraPageProps) {
  const { lmraId } = await params;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    forbidden();
  }

  const assessment = await getLmraAssessment(currentCompanyId, lmraId);
  if (!assessment) {
    notFound();
  }
  if (assessment.status === "archived") {
    forbidden();
  }

  const [roleNames, isForeman, myEmployeeId, project] = await Promise.all([
    getUserRoleNames(currentCompanyId),
    isCallerProjectForeman(currentCompanyId, assessment.project_id, user.id),
    getMyEmployeeId(currentCompanyId, user.id),
    getProject(currentCompanyId, assessment.project_id),
  ]);

  const isOwnAssessment = Boolean(myEmployeeId && assessment.completed_by_employee_id === myEmployeeId);
  if (!canManageLmra(roleNames, isForeman, isOwnAssessment)) {
    forbidden();
  }

  // `project` can legitimately be null even though the caller can manage
  // this assessment — see app/(app)/lmra/[lmraId]/page.tsx's comment on the
  // same lookup: projects_select doesn't grant hseq_manager company-wide
  // visibility the way lmra_assessments_select does. Degrade gracefully
  // rather than 404ing a record this HSE Manager is genuinely allowed to
  // edit.
  const projectName = project?.name ?? "Project unavailable";

  const candidateRows = await listLmraCandidateEmployees(currentCompanyId, assessment.project_id);
  const candidates = toEmployeeOptions(candidateRows);
  const hazardsEditable = assessment.status === "draft";

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Edit LMRA" description={`${projectName} · ${assessment.work_activity}`} />
      <div className="max-w-3xl">
        <LmraForm
          mode="edit"
          companyId={currentCompanyId}
          projectId={assessment.project_id}
          projectName={projectName}
          candidates={candidates}
          todayDate={new Date().toISOString().slice(0, 10)}
          hazardRows={lmraHazardInputsFromRows(assessment.hazards)}
          participantIds={assessment.participants.map((participant) => participant.employee_id)}
          assessment={assessment}
          hazardsEditable={hazardsEditable}
        />
      </div>
    </div>
  );
}
