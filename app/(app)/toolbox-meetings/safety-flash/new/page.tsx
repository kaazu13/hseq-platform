import { forbidden } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentOrganization } from "@/modules/organizations/queries";
import { listProjects } from "@/modules/projects/queries";
import { listSafetyFlashAuthorizedEmployees } from "@/modules/safety-flash/queries";
import { SafetyFlashForm } from "@/modules/safety-flash/components/safety-flash-form";
import { PageHeader } from "@/components/shared/page-header";

export default async function NewSafetyFlashPage() {
  const { user } = await requireUser();
  const { currentOrganizationId } = await resolveCurrentOrganization(user.id);

  if (!currentOrganizationId) {
    forbidden();
  }

  const roleNames = await getUserRoleNames(currentOrganizationId);
  const isEligible = roleNames.includes("hseq_manager") || roleNames.includes("hse_officer");
  if (!isEligible) {
    forbidden();
  }

  const [projects, candidates] = await Promise.all([listProjects(currentOrganizationId), listSafetyFlashAuthorizedEmployees(currentOrganizationId, null)]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="New Safety Flash" description="A short, one-page safety bulletin — organization-wide or scoped to a single project." />
      <div className="max-w-3xl">
        <SafetyFlashForm organizationId={currentOrganizationId} projects={projects} candidates={candidates} />
      </div>
    </div>
  );
}
