import { forbidden, notFound } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentOrganization } from "@/modules/organizations/queries";
import { canManageEmployees } from "@/modules/employees/permissions";
import { getEmployeeByNumber } from "@/modules/employees/queries";
import { EmployeeForm } from "@/modules/employees/components/employee-form";
import { PageHeader } from "@/components/shared/page-header";

type EditEmployeePageProps = {
  params: Promise<{ employeeNumber: string }>;
};

export default async function EditEmployeePage({ params }: EditEmployeePageProps) {
  const { employeeNumber } = await params;
  const { user } = await requireUser();
  const { currentOrganizationId } = await resolveCurrentOrganization(user.id);

  if (!currentOrganizationId) {
    forbidden();
  }

  const roleNames = await getUserRoleNames(currentOrganizationId);
  if (!canManageEmployees(roleNames)) {
    forbidden();
  }

  const employee = await getEmployeeByNumber(currentOrganizationId, employeeNumber);
  if (!employee) {
    notFound();
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title={`Edit ${employee.first_name} ${employee.last_name}`}
        description="Update this employee's record."
      />
      <div className="max-w-2xl">
        <EmployeeForm mode="edit" organizationId={currentOrganizationId} employee={employee} />
      </div>
    </div>
  );
}
