import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getScaffold } from "@/modules/scaffolds/queries";

type LegacyScaffoldRedirectPageProps = {
  params: Promise<{ scaffoldId: string }>;
};

/**
 * Thin, verified redirect — see app/(app)/scaffolds/page.tsx's header
 * comment for the general rationale. Unlike the entity-less routes, this
 * one has a real scaffoldId in the URL: it's resolved (never trusted) via
 * `getScaffold(companyId, scaffoldId)`, scoped to the caller's own current
 * company — a scaffold that doesn't exist, or belongs to a different
 * company, 404s here exactly as it would on the canonical route, rather
 * than leaking existence through a redirect.
 */
export default async function LegacyScaffoldRedirectPage({ params }: LegacyScaffoldRedirectPageProps) {
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

  redirect(`/companies/${currentCompanyId}/projects/${scaffold.project_id}/scaffolds/${scaffold.id}`);
}
