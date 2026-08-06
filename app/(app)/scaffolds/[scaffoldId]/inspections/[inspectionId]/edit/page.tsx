import { forbidden, notFound, redirect } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getProject } from "@/modules/projects/queries";
import { getInspection, getScaffold, isCallerProjectAccessible } from "@/modules/scaffolds/queries";
import { canManageScaffold } from "@/modules/scaffolds/permissions";
import { SCAFFOLD_INSPECTION_REASON_LABELS } from "@/modules/scaffolds/types";
import { InspectionChecklist } from "@/modules/scaffolds/components/inspection-checklist";
import { InspectionFinalizeCard } from "@/modules/scaffolds/components/inspection-finalize-card";
import { listDefectsForInspection, listScaffoldDefectCandidateEmployees } from "@/modules/scaffold-defects/queries";
import { hasUnresolvedScaffoldDefects } from "@/modules/scaffold-defects/types";
import { canManageScaffoldDefectDetails } from "@/modules/scaffold-defects/permissions";
import { ScaffoldDefectsSection } from "@/modules/scaffold-defects/components/scaffold-defects-section";
import { toEmployeeOptions } from "@/modules/employees/employee-options";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";

type EditInspectionPageProps = {
  params: Promise<{ scaffoldId: string; inspectionId: string }>;
};

/**
 * The draft inspection workspace — checklist, defects, and the finalize
 * workflow, all on one scrolling page (docs/UI_GUIDELINES.md §4's
 * field-facing form guidance, same "single-column sections, not a full JS
 * stepper" simplification already disclosed for LMRA). Redirects to the
 * read-only detail page once finalized — this route only exists for
 * drafts.
 */
export default async function EditInspectionPage({ params }: EditInspectionPageProps) {
  const { scaffoldId, inspectionId } = await params;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    forbidden();
  }

  const inspection = await getInspection(currentCompanyId, inspectionId);
  if (!inspection || inspection.scaffold_id !== scaffoldId) {
    notFound();
  }
  if (inspection.status === "finalized") {
    redirect(`/scaffolds/${scaffoldId}/inspections/${inspectionId}`);
  }

  const [roleNames, hasProjectAccess, scaffold, project] = await Promise.all([
    getUserRoleNames(currentCompanyId),
    isCallerProjectAccessible(inspection.project_id),
    getScaffold(currentCompanyId, scaffoldId),
    getProject(currentCompanyId, inspection.project_id),
  ]);

  if (!canManageScaffold(roleNames, hasProjectAccess)) {
    forbidden();
  }
  if (!scaffold) {
    notFound();
  }

  const projectName = project?.name ?? "Project unavailable";
  const [defects, defectCandidates] = await Promise.all([
    listDefectsForInspection(currentCompanyId, inspectionId),
    listScaffoldDefectCandidateEmployees(currentCompanyId, inspection.project_id),
  ]);
  const canManageDefects = canManageScaffoldDefectDetails(roleNames, hasProjectAccess);
  const defectCandidateOptions = toEmployeeOptions(defectCandidates);

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6">
      <PageHeader
        title={`Inspecting ${scaffold.tag_number}`}
        description={`${projectName} · ${scaffold.work_area} · ${SCAFFOLD_INSPECTION_REASON_LABELS[inspection.inspection_reason]}`}
      />

      <div className="flex flex-col gap-3">
        <SectionHeader title="Checklist" description="24 fixed safety items — mark each Acceptable, Defect found, or Not applicable." />
        <InspectionChecklist companyId={currentCompanyId} inspectionId={inspection.id} scaffoldId={scaffoldId} projectId={inspection.project_id} items={inspection.items} candidates={defectCandidateOptions} readOnly={false} />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeader title="Defects" />
        <ScaffoldDefectsSection
          companyId={currentCompanyId}
          inspectionId={inspection.id}
          scaffoldId={scaffoldId}
          projectId={inspection.project_id}
          defects={defects}
          candidates={defectCandidateOptions}
          canCreate={canManageDefects}
          canManageDetails={canManageDefects}
          roleNames={roleNames}
          hasProjectAccess={hasProjectAccess}
          currentUserProfileId={user.id}
        />
      </div>

      <InspectionFinalizeCard
        companyId={currentCompanyId}
        inspectionId={inspection.id}
        scaffoldId={scaffoldId}
        projectId={inspection.project_id}
        hasUnresolvedDefects={hasUnresolvedScaffoldDefects(defects)}
      />
    </div>
  );
}
