import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getInspection } from "@/modules/scaffolds/queries";

type LegacyInspectionRedirectPageProps = {
  params: Promise<{ scaffoldId: string; inspectionId: string }>;
};

/**
 * Thin, verified redirect — see app/(app)/scaffolds/[scaffoldId]/page.tsx's
 * header comment for the general rationale. The inspection is resolved
 * (never trusted) via `getInspection(companyId, inspectionId)`, and its
 * `scaffold_id` cross-checked against the URL's `scaffoldId` — exactly the
 * URL-vs-row mismatch check every canonical route in this tree performs —
 * before redirecting to the canonical inspection view.
 */
export default async function LegacyInspectionRedirectPage({ params }: LegacyInspectionRedirectPageProps) {
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

  redirect(`/companies/${currentCompanyId}/projects/${inspection.project_id}/scaffolds/${scaffoldId}/inspections/${inspectionId}`);
}
