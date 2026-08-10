import { forbidden, notFound } from "next/navigation";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames } from "@/lib/auth/session";
import { getScaffold, isCallerProjectAccessible, listScaffoldCandidateEmployees, listInspectionsForScaffold } from "@/modules/scaffolds/queries";
import { canManageScaffold } from "@/modules/scaffolds/permissions";
import { InspectionForm } from "@/modules/scaffolds/components/inspection-form";
import { toEmployeeOptions } from "@/modules/employees/employee-options";
import { PageHeader } from "@/components/shared/page-header";

type NewInspectionPageProps = {
  params: Promise<{ companyId: string; projectId: string; scaffoldId: string }>;
};

/** Authorization hardening: same URL-vs-row project cross-check as the scaffold detail page. */
export default async function NewInspectionPage({ params }: NewInspectionPageProps) {
  const { companyId, projectId, scaffoldId } = await params;
  await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const scaffold = await getScaffold(companyId, scaffoldId);
  if (!scaffold || scaffold.project_id !== projectId) {
    notFound();
  }

  const [roleNames, hasProjectAccess] = await Promise.all([getUserRoleNames(companyId), isCallerProjectAccessible(scaffold.project_id)]);
  if (!canManageScaffold(roleNames, hasProjectAccess)) {
    forbidden();
  }
  // A closed/dismantled scaffold is retired — validate_scaffold_inspection_insert()
  // is the authoritative guard (also exempts corrections, which have no UI
  // entry point here anyway), this just avoids rendering a form whose
  // submit would always fail.
  if (scaffold.status === "closed") {
    forbidden();
  }

  const [candidates, priorInspections] = await Promise.all([
    listScaffoldCandidateEmployees(companyId, scaffold.project_id),
    listInspectionsForScaffold(companyId, scaffoldId),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="New inspection" description={`${scaffold.tag_number} · ${scaffold.work_area}`} />
      <div className="max-w-3xl">
        <InspectionForm companyId={companyId} scaffoldId={scaffold.id} projectId={scaffold.project_id} candidates={toEmployeeOptions(candidates)} priorInspections={priorInspections} />
      </div>
    </div>
  );
}
