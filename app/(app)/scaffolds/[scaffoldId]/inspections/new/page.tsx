import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getScaffold } from "@/modules/scaffolds/queries";

type LegacyNewInspectionRedirectPageProps = {
  params: Promise<{ scaffoldId: string }>;
};

/** Thin, verified redirect — see app/(app)/scaffolds/[scaffoldId]/page.tsx's header comment for the rationale. */
export default async function LegacyNewInspectionRedirectPage({ params }: LegacyNewInspectionRedirectPageProps) {
  const { scaffoldId } = await params;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);
  if (!currentCompanyId) {
    notFound();
  }

  const scaffold = await getScaffold(currentCompanyId, scaffoldId);
  if (!scaffold) {
    notFound();
  }

  redirect(`/companies/${currentCompanyId}/projects/${scaffold.project_id}/scaffolds/${scaffold.id}/inspections/new`);
}
