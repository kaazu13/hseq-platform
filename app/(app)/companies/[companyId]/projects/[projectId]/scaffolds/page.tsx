import Link from "next/link";
import { notFound, forbidden } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { HardHat, Plus } from "lucide-react";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames, isEmployeeOnlyAccount } from "@/lib/auth/session";
import { getProject } from "@/modules/projects/queries";
import { listScaffolds, getCurrentInspectionExpiryByScaffold, type ScaffoldListFilters } from "@/modules/scaffolds/queries";
import { resolveInspectionHealth, type InspectionHealthState } from "@/modules/scaffolds/inspection-health";
import { getProjectLocalDate } from "@/lib/project-date";
import { ScaffoldCard } from "@/modules/scaffolds/components/scaffold-card";
import { ScaffoldFilters } from "@/modules/scaffolds/components/scaffold-filters";
import { ScaffoldHealthQuickFilters } from "@/modules/scaffolds/components/scaffold-health-quick-filters";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { CreateSuccessToast } from "@/components/shared/create-success-toast";
import { RefreshButton } from "@/components/shared/refresh-button";
import { Button } from "@/components/ui/button";

type ScaffoldsPageProps = {
  params: Promise<{ companyId: string; projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

/**
 * Scaffold register — canonical project-scoped route. RLS (scaffolds_select)
 * is the real scoping — `listScaffolds` never trusts these URL params to
 * decide visibility on its own — but every project-scoped page in this new
 * route tree ALSO independently verifies, beyond RLS, that `companyId` and
 * `projectId` genuinely belong together before rendering anything: RLS only
 * ever answers "is this company/project accessible to me at all," never
 * "does it match what THIS SPECIFIC URL claims" — a URL substitution (a
 * real project id, but under a different company's URL segment) must 404,
 * not silently render the wrong company's chrome around real data.
 */
export default async function ScaffoldsPage({ params, searchParams }: ScaffoldsPageProps) {
  const { companyId, projectId } = await params;
  const urlParams = await searchParams;

  await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const project = await getProject(companyId, projectId);
  if (!project) {
    notFound();
  }

  // Employee-role correction: employees are already excluded from
  // scaffolds_select RLS (see supabase/migrations/20260831093000), which
  // makes this page show a bare "No scaffolds found" empty state for
  // them today — indistinguishable from a genuinely-empty register. A
  // real forbidden() is a more honest response for a page Employee was
  // never meant to see at all.
  const roleNames = await getUserRoleNames(companyId);
  if (isEmployeeOnlyAccount(roleNames)) {
    forbidden();
  }

  const filters: ScaffoldListFilters = {
    projectId,
    workAreaSearch: urlParams.workArea,
    scaffoldType: urlParams.scaffoldType,
    status: urlParams.status,
  };

  const scaffolds = await listScaffolds(companyId, filters);
  const expiryByScaffold = await getCurrentInspectionExpiryByScaffold(companyId, scaffolds.map((s) => s.id));
  const basePath = `/companies/${companyId}/projects/${projectId}/scaffolds`;
  const t = await getTranslations("ScaffoldRegister");

  // Part 10 — quick filter chips reuse the SAME shared health resolver the
  // Inspection Dashboard/Scaffold Map use (never a second, independent
  // status rule), computed from the expiry data this page already fetches
  // — no new query. Filtering happens here, server-side, from the ALREADY
  // company/project-scoped `scaffolds` list — the `?health=` param never
  // widens what RLS/listScaffolds already resolved.
  const todayDate = getProjectLocalDate(project.timezone);
  const healthByScaffoldId = new Map(scaffolds.map((scaffold) => [scaffold.id, resolveInspectionHealth(scaffold.status, expiryByScaffold.get(scaffold.id) ?? null, todayDate)]));
  const healthCounts: Record<InspectionHealthState, number> = { awaiting_initial: 0, expired: 0, due_today: 0, expiring_tomorrow: 0, valid: 0, dismantled: 0 };
  for (const state of healthByScaffoldId.values()) healthCounts[state]++;

  const activeHealthFilter = urlParams.health as InspectionHealthState | undefined;
  const visibleScaffolds = activeHealthFilter ? scaffolds.filter((scaffold) => healthByScaffoldId.get(scaffold.id) === activeHealthFilter) : scaffolds;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <CreateSuccessToast
        paramName="created"
        message={t.raw("createdMessage")}
        viewHrefTemplate={`${basePath}/{value}`}
        viewLabel={t("viewScaffold")}
      />
      <PageHeader
        title={t("title")}
        description={t("description", { project: project.name })}
        actions={
          <>
            <RefreshButton />
            <Button size="sm" nativeButton={false} render={<Link href={`${basePath}/new`} />}>
              <Plus />
              {t("registerScaffold")}
            </Button>
          </>
        }
      />

      <ScaffoldFilters basePath={basePath} />
      <ScaffoldHealthQuickFilters basePath={basePath} activeHealth={activeHealthFilter} counts={healthCounts} />

      {visibleScaffolds.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title={t("noScaffoldsTitle")}
          description={t("noScaffoldsDescription")}
          action={
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`${basePath}/new`} />}>
              <Plus />
              {t("registerScaffold")}
            </Button>
          }
          className="flex-1"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleScaffolds.map((scaffold) => (
            <ScaffoldCard
              key={scaffold.id}
              scaffold={scaffold}
              projectName={project.name}
              currentInspectionExpiresAt={expiryByScaffold.get(scaffold.id) ?? null}
              href={`${basePath}/${scaffold.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
