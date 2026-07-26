import { forbidden } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentOrganization } from "@/modules/organizations/queries";
import { canManageEmployees } from "@/modules/employees/permissions";
import { EmployeeForm } from "@/modules/employees/components/employee-form";
import { PageHeader } from "@/components/shared/page-header";

/**
 * Dedicated create route (docs/PRODUCT_REQUIREMENTS.md — Employee
 * Management Foundation §4). Gated server-side by role, not just a hidden
 * button on the list page, so direct URL access is refused the same way —
 * `forbidden()` here is a second, redundant line of defense on top of the
 * `requireAnyRole()` check inside `createEmployee` itself and the
 * `employees_insert_managers` RLS policy.
 */
export default async function NewEmployeePage() {
  const { user } = await requireUser();
  const { currentOrganizationId } = await resolveCurrentOrganization(user.id);

  if (!currentOrganizationId) {
    forbidden();
  }

  const roleNames = await getUserRoleNames(currentOrganizationId);
  if (!canManageEmployees(roleNames)) {
    forbidden();
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Add employee" description="Create a new employee record for this organization." />
      <div className="max-w-2xl">
        <EmployeeForm mode="create" organizationId={currentOrganizationId} />
      </div>
    </div>
  );
}
