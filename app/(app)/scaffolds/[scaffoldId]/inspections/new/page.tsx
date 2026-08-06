import { forbidden, notFound } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getScaffold, isCallerProjectAccessible, listScaffoldCandidateEmployees, listInspectionsForScaffold } from "@/modules/scaffolds/queries";
import { canManageScaffold } from "@/modules/scaffolds/permissions";
import { InspectionForm } from "@/modules/scaffolds/components/inspection-form";
import { toEmployeeOptions } from "@/modules/employees/employee-options";
import { PageHeader } from "@/components/shared/page-header";

type NewInspectionPageProps = {
  params: Promise<{ scaffoldId: string }>;
};

export default async function NewInspectionPage({ params }: NewInspectionPageProps) {
  const { scaffoldId } = await params;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    forbidden();
  }

  const scaffold = await getScaffold(currentCompanyId, scaffoldId);
  if (!scaffold) {
    notFound();
  }

  const [roleNames, hasProjectAccess] = await Promise.all([getUserRoleNames(currentCompanyId), isCallerProjectAccessible(scaffold.project_id)]);
  if (!canManageScaffold(roleNames, hasProjectAccess)) {
    forbidden();
  }

  const [candidates, priorInspections] = await Promise.all([
    listScaffoldCandidateEmployees(currentCompanyId, scaffold.project_id),
    listInspectionsForScaffold(currentCompanyId, scaffoldId),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="New inspection" description={`${scaffold.tag_number} · ${scaffold.work_area}`} />
      <div className="max-w-3xl">
        <InspectionForm companyId={currentCompanyId} scaffoldId={scaffold.id} projectId={scaffold.project_id} candidates={toEmployeeOptions(candidates)} priorInspections={priorInspections} />
      </div>
    </div>
  );
}
