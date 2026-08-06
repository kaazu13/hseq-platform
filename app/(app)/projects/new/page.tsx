import { forbidden } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { canCreateProjects } from "@/modules/projects/permissions";
import { ProjectForm } from "@/modules/projects/components/project-form";
import { PageHeader } from "@/components/shared/page-header";

/**
 * Dedicated create route, gated server-side (not just a hidden button) —
 * same shape as app/(app)/employees/new/page.tsx. Assigning Project
 * Managers/HSEQ Managers happens after creation, on the project's
 * Assignments tab — a project must exist before anyone can be assigned to
 * it (projects_insert RLS is company-wide-role-only for exactly this reason).
 */
export default async function NewProjectPage() {
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    forbidden();
  }

  const roleNames = await getUserRoleNames(currentCompanyId);
  if (!canCreateProjects(roleNames)) {
    forbidden();
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="New project" description="Create a new project for this company." />
      <div className="max-w-3xl">
        <ProjectForm mode="create" companyId={currentCompanyId} />
      </div>
    </div>
  );
}
