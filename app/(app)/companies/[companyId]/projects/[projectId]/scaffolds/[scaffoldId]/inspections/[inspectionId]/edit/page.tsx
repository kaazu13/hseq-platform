import { forbidden, notFound, redirect } from "next/navigation";
import { requireCompanyMembership, requireProjectAccess, requireUser, getUserRoleNames } from "@/lib/auth/session";
import { getProject } from "@/modules/projects/queries";
import { getInspection, getScaffold, isCallerProjectAccessible } from "@/modules/scaffolds/queries";
import { canManageScaffold } from "@/modules/scaffolds/permissions";
import { SCAFFOLD_INSPECTION_REASON_LABELS, formatInspectionReference } from "@/modules/scaffolds/types";
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
  params: Promise<{ companyId: string; projectId: string; scaffoldId: string; inspectionId: string }>;
};

/**
 * The draft inspection workspace — checklist, defects, and the finalize
 * workflow, all on one scrolling page (docs/UI_GUIDELINES.md §4's
 * field-facing form guidance, same "single-column sections, not a full JS
 * stepper" simplification already disclosed for LMRA). Redirects to the
 * read-only canonical detail page once finalized — this route only exists
 * for drafts.
 *
 * Authorization hardening: same URL-vs-row company/project cross-checks as
 * the canonical inspection detail page — see that page's header comment.
 */
export default async function EditInspectionPage({ params }: EditInspectionPageProps) {
  const { companyId, projectId, scaffoldId, inspectionId } = await params;
  const { user } = await requireUser();
  await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const inspection = await getInspection(companyId, inspectionId);
  if (!inspection || inspection.scaffold_id !== scaffoldId || inspection.project_id !== projectId) {
    notFound();
  }
  if (inspection.status === "finalized") {
    redirect(`/companies/${companyId}/projects/${projectId}/scaffolds/${scaffoldId}/inspections/${inspectionId}`);
  }

  const [roleNames, hasProjectAccess, scaffold, project] = await Promise.all([
    getUserRoleNames(companyId),
    isCallerProjectAccessible(inspection.project_id),
    getScaffold(companyId, scaffoldId),
    getProject(companyId, inspection.project_id),
  ]);

  if (!canManageScaffold(roleNames, hasProjectAccess)) {
    forbidden();
  }
  if (!scaffold || scaffold.project_id !== projectId) {
    notFound();
  }

  const projectName = project?.name ?? "Project unavailable";
  const [defects, defectCandidates] = await Promise.all([
    listDefectsForInspection(companyId, inspectionId),
    listScaffoldDefectCandidateEmployees(companyId, inspection.project_id),
  ]);
  const canManageDefects = canManageScaffoldDefectDetails(roleNames, hasProjectAccess);
  const defectCandidateOptions = toEmployeeOptions(defectCandidates);

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6">
      <PageHeader
        title={`Inspecting ${scaffold.tag_number} — ${formatInspectionReference(scaffold, inspection)}`}
        description={`${projectName} · ${scaffold.work_area} · ${SCAFFOLD_INSPECTION_REASON_LABELS[inspection.inspection_reason]}`}
      />

      <div className="flex flex-col gap-3">
        <SectionHeader title="Checklist" description="24 fixed safety items — mark each Acceptable, Defect found, or Not applicable." />
        <InspectionChecklist companyId={companyId} inspectionId={inspection.id} scaffoldId={scaffoldId} projectId={inspection.project_id} items={inspection.items} candidates={defectCandidateOptions} readOnly={false} />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeader title="Defects" />
        <ScaffoldDefectsSection
          companyId={companyId}
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
        companyId={companyId}
        inspectionId={inspection.id}
        scaffoldId={scaffoldId}
        projectId={inspection.project_id}
        hasUnresolvedDefects={hasUnresolvedScaffoldDefects(defects)}
      />
    </div>
  );
}
