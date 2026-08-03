import { forbidden } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentOrganization } from "@/modules/organizations/queries";
import { canManageToolboxTemplate } from "@/modules/toolbox-templates/permissions";
import { ToolboxTemplateForm } from "@/modules/toolbox-templates/components/toolbox-template-form";
import { PageHeader } from "@/components/shared/page-header";

export default async function NewToolboxTemplatePage() {
  const { user } = await requireUser();
  const { currentOrganizationId } = await resolveCurrentOrganization(user.id);

  if (!currentOrganizationId) {
    forbidden();
  }

  const roleNames = await getUserRoleNames(currentOrganizationId);
  if (!canManageToolboxTemplate(roleNames)) {
    forbidden();
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Upload toolbox template" description="Added to the organization-wide reusable template library." />
      <div className="max-w-3xl">
        <ToolboxTemplateForm organizationId={currentOrganizationId} />
      </div>
    </div>
  );
}
