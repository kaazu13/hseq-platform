import { forbidden } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { canManageEmployees } from "@/modules/employees/permissions";
import { listProjects } from "@/modules/projects/queries";
import { EmployeeImportWizard } from "@/modules/employees/components/employee-import-wizard";
import { PageHeader } from "@/components/shared/page-header";

/** Items 9/10 — bulk employee import entry point. Gated the same as every other employee-write action (EMPLOYEE_WRITE_ROLES). */
export default async function EmployeeImportPage() {
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);
  if (!currentCompanyId) forbidden();

  const roleNames = await getUserRoleNames(currentCompanyId);
  if (!canManageEmployees(roleNames)) forbidden();

  const projects = await listProjects(currentCompanyId);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Import Employees" description="Upload a spreadsheet of new employees — review before anything is created." />
      <EmployeeImportWizard companyId={currentCompanyId} projects={projects.filter((p) => p.status !== "archived").map((p) => ({ id: p.id, name: p.name }))} />
    </div>
  );
}
