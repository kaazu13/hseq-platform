import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { resolveCurrentProject } from "@/modules/projects/queries";

type LegacyScaffoldsRedirectPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

/**
 * Thin, verified redirect — the pre-milestone flat scaffold register route.
 * The Scaffold Register is now project-scoped (this milestone's cutover-
 * plus-redirect requirement: the canonical route replaces this one, but
 * old links/bookmarks — including Safety Overview's `?status=` stat-card
 * links — must not 404). No entity id lives in this URL, so there is
 * nothing to verify beyond resolving the caller's own current
 * company+project — if that's ambiguous (multiple companies/projects with
 * no stored preference), send them to /dashboard's resolver/selector
 * instead of guessing. There is deliberately no company-wide scaffold list
 * to redirect to instead — the canonical architecture is project-scoped by
 * design (this milestone's explicit requirement), so a redirect can only
 * ever land on ONE project's register, not aggregate across every project
 * the way this flat route used to.
 */
export default async function LegacyScaffoldsRedirectPage({ searchParams }: LegacyScaffoldsRedirectPageProps) {
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);
  if (!currentCompanyId) {
    redirect("/dashboard");
  }

  const { currentProjectId } = await resolveCurrentProject(user.id, currentCompanyId);
  if (!currentProjectId) {
    redirect("/dashboard");
  }

  const resolvedSearchParams = await searchParams;
  const query = new URLSearchParams(
    Object.entries(resolvedSearchParams).filter((entry): entry is [string, string] => entry[1] !== undefined),
  ).toString();
  redirect(`/companies/${currentCompanyId}/projects/${currentProjectId}/scaffolds${query ? `?${query}` : ""}`);
}
