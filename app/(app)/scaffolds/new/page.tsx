import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { resolveCurrentProject } from "@/modules/projects/queries";

/** Thin, verified redirect — see app/(app)/scaffolds/page.tsx's header comment for the rationale. */
export default async function LegacyNewScaffoldRedirectPage() {
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);
  if (!currentCompanyId) {
    redirect("/dashboard");
  }

  const { currentProjectId } = await resolveCurrentProject(user.id, currentCompanyId);
  if (!currentProjectId) {
    redirect("/dashboard");
  }

  redirect(`/companies/${currentCompanyId}/projects/${currentProjectId}/scaffolds/new`);
}
