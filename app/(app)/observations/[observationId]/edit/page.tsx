import { forbidden, notFound } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentOrganization } from "@/modules/organizations/queries";
import { getProject } from "@/modules/projects/queries";
import { getObservation, isCallerProjectAccessible, listObservationCandidateEmployees } from "@/modules/observations/queries";
import { canEditObservation } from "@/modules/observations/permissions";
import { ObservationForm } from "@/modules/observations/components/observation-form";
import { ObservationParticipantsPicker } from "@/modules/observations/components/observation-participants-picker";
import { toEmployeeOptions } from "@/components/shared/employee-combobox";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";

type EditObservationPageProps = {
  params: Promise<{ observationId: string }>;
};

/**
 * Edit surface — core fields plus the "people involved" picker. Only the
 * observation's own author may edit it (unless HSE Manager) — see
 * modules/observations/permissions.ts's canEditObservation, a genuine
 * departure from LMRA's project-wide Foreman edit rights.
 */
export default async function EditObservationPage({ params }: EditObservationPageProps) {
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
  if (observation.status === "closed") {
    forbidden();
  }

  const [roleNames, hasProjectAccess, project] = await Promise.all([
    getUserRoleNames(currentOrganizationId),
    isCallerProjectAccessible(observation.project_id),
    getProject(currentOrganizationId, observation.project_id),
  ]);

  if (!canEditObservation(roleNames, hasProjectAccess, observation.created_by === user.id)) {
    forbidden();
  }

  const projectName = project?.name ?? "Project unavailable";
  const candidates = await listObservationCandidateEmployees(currentOrganizationId, observation.project_id);
  const employeeOptions = toEmployeeOptions(candidates);

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6">
      <PageHeader title="Edit observation" description={`${projectName} · ${observation.work_area}`} />

      <div className="max-w-3xl">
        <ObservationForm mode="edit" organizationId={currentOrganizationId} projectId={observation.project_id} projectName={projectName} candidates={employeeOptions} observation={observation} />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeader title="People involved" description="Optional — anyone directly involved in this observation." />
        <ObservationParticipantsPicker
          organizationId={currentOrganizationId}
          observationId={observation.id}
          projectId={observation.project_id}
          createdBy={observation.created_by}
          candidates={candidates}
          currentParticipantIds={observation.participants.map((participant) => participant.employee_id)}
          readOnly={false}
        />
      </div>
    </div>
  );
}
