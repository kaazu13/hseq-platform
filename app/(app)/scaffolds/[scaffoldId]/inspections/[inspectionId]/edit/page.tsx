import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getInspection } from "@/modules/scaffolds/queries";

type LegacyEditInspectionRedirectPageProps = {
  params: Promise<{ scaffoldId: string; inspectionId: string }>;
};

/** Thin, verified redirect — see app/(app)/scaffolds/[scaffoldId]/inspections/[inspectionId]/page.tsx's header comment for the rationale. */
export default async function LegacyEditInspectionRedirectPage({ params }: LegacyEditInspectionRedirectPageProps) {
  const { scaffoldId, inspectionId } = await params;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);
  if (!currentCompanyId) {
    notFound();
  }

  const inspection = await getInspection(currentCompanyId, inspectionId);
  if (!inspection || inspection.scaffold_id !== scaffoldId) {
    notFound();
  }

  redirect(`/companies/${currentCompanyId}/projects/${inspection.project_id}/scaffolds/${scaffoldId}/inspections/${inspectionId}/edit`);
}
