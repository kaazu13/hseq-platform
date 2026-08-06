import { forbidden } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { listProjects } from "@/modules/projects/queries";
import { listSafetyFlashAuthorizedEmployees } from "@/modules/safety-flash/queries";
import { SafetyFlashForm } from "@/modules/safety-flash/components/safety-flash-form";
import { toEmployeeOptions } from "@/modules/employees/employee-options";
import { PageHeader } from "@/components/shared/page-header";

export default async function NewSafetyFlashPage() {
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    forbidden();
  }

  const roleNames = await getUserRoleNames(currentCompanyId);
  const isEligible = roleNames.includes("hseq_manager") || roleNames.includes("hse_officer");
  if (!isEligible) {
    forbidden();
  }

  const [projects, candidateRows] = await Promise.all([listProjects(currentCompanyId), listSafetyFlashAuthorizedEmployees(currentCompanyId, null)]);
  const candidates = toEmployeeOptions(candidateRows);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="New Safety Flash" description="A short, one-page safety bulletin — company-wide or scoped to a single project." />
      <div className="max-w-3xl">
        <SafetyFlashForm companyId={currentCompanyId} projects={projects} candidates={candidates} />
      </div>
    </div>
  );
}
