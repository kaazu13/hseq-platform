import { forbidden } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { canManageToolboxTemplate } from "@/modules/toolbox-templates/permissions";
import { ToolboxTemplateForm } from "@/modules/toolbox-templates/components/toolbox-template-form";
import { PageHeader } from "@/components/shared/page-header";

export default async function NewToolboxTemplatePage() {
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    forbidden();
  }

  const roleNames = await getUserRoleNames(currentCompanyId);
  if (!canManageToolboxTemplate(roleNames)) {
    forbidden();
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Upload toolbox template" description="Added to the company-wide reusable template library." />
      <div className="max-w-3xl">
        <ToolboxTemplateForm companyId={currentCompanyId} />
      </div>
    </div>
  );
}
