import { notFound } from "next/navigation";
import { getTranslations, getFormatter } from "next-intl/server";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames, isPlatformSuperAdmin } from "@/lib/auth/session";
import { getProject } from "@/modules/projects/queries";
import { canViewInspectionDashboard, canManageScaffold } from "@/modules/scaffolds/permissions";
import { getScaffoldInspectionOverview } from "@/modules/scaffolds/queries";
import { computeInspectionDashboardAggregate, resolveInspectionHealth } from "@/modules/scaffolds/inspection-health";
import { formatInspectionInterval } from "@/modules/scaffolds/types";
import { ScaffoldMapPageClient } from "@/modules/scaffolds/components/scaffold-map-page-client";
import type { PriorityRow } from "@/modules/scaffolds/components/inspection-priority-section";
import type { ScaffoldMapEntry } from "@/modules/scaffolds/components/scaffold-map-page-client";
import { getProjectLocalDate } from "@/lib/project-date";
import { PageHeader } from "@/components/shared/page-header";
import { RefreshButton } from "@/components/shared/refresh-button";
import { AutoRefresh } from "@/components/shared/auto-refresh";

type ScaffoldMapPageProps = {
  params: Promise<{ companyId: string; projectId: string }>;
};

/**
 * Scaffold Map (Parts U-AC) — reuses the SAME getScaffoldInspectionOverview
 * aggregate the Inspection Dashboard uses (Part X: "do not mix status
 * logic independently — use one shared resolver"), never a second,
 * independent set of expensive queries. Server Component fetches + does
 * ALL translation/formatting; the client-side piece (filters + the
 * Leaflet map itself) only ever re-slices the already-loaded array.
 */
export default async function ScaffoldMapPage({ params }: ScaffoldMapPageProps) {
  const { companyId, projectId } = await params;
  await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const project = await getProject(companyId, projectId);
  if (!project) notFound();

  const [roleNames, isSuperAdmin] = await Promise.all([getUserRoleNames(companyId), isPlatformSuperAdmin()]);
  const canView = isSuperAdmin || canViewInspectionDashboard(roleNames, true);
  if (!canView) notFound();
  const canInspect = isSuperAdmin || canManageScaffold(roleNames, true);

  const [t, tDash, format] = await Promise.all([getTranslations("ScaffoldMap"), getTranslations("InspectionDashboard"), getFormatter()]);
  const todayDate = getProjectLocalDate(project.timezone);
  const overview = await getScaffoldInspectionOverview(projectId);
  const aggregate = computeInspectionDashboardAggregate(overview, todayDate);

  const basePath = `/companies/${companyId}/projects/${projectId}`;

  function formatDate(value: string | null): string | null {
    return value ? format.dateTime(new Date(value), { dateStyle: "medium" }) : null;
  }

  const activeRows = overview.filter((row) => row.status !== "closed");
  const entries: ScaffoldMapEntry[] = activeRows.map((row) => {
    const state = resolveInspectionHealth(row.status, row.latestExpiresAt, todayDate);
    const frequencyLabel = row.latestIntervalType && row.latestIntervalDays ? formatInspectionInterval(row.latestIntervalType, row.latestIntervalDays, (days) => tDash("everyNDays", { days })) : tDash("notYetSet");
    const hasLocation = row.latitude !== null && row.longitude !== null;
    return {
      hasLocation,
      marker: {
        scaffoldId: row.scaffoldId,
        scaffoldNumber: row.scaffoldNumber,
        workArea: row.workArea,
        latitude: row.latitude ?? 0,
        longitude: row.longitude ?? 0,
        healthState: state,
        healthLabel: tDash(`state.${state}`),
        frequencyLabel,
        lastInspectionLabel: formatDate(row.latestFinalizedAt),
        inspectorName: row.latestInspectorName,
        nextDueLabel: row.latestExpiresAt ? formatDate(row.latestExpiresAt) : null,
        scaffoldHref: `${basePath}/scaffolds/${row.scaffoldId}`,
        inspectionHref: row.latestInspectionId ? `${basePath}/scaffolds/${row.scaffoldId}/inspections/${row.latestInspectionId}` : null,
        inspectHref: canInspect ? `${basePath}/scaffolds/${row.scaffoldId}/inspections/new` : null,
      },
    };
  });

  const unlocatedCount = entries.filter((e) => !e.hasLocation).length;

  function toPriorityRow(row: (typeof overview)[number]): PriorityRow {
    const state = resolveInspectionHealth(row.status, row.latestExpiresAt, todayDate);
    const frequencyLabel = row.latestIntervalType && row.latestIntervalDays ? formatInspectionInterval(row.latestIntervalType, row.latestIntervalDays, (days) => tDash("everyNDays", { days })) : tDash("notYetSet");
    return {
      scaffoldId: row.scaffoldId,
      scaffoldNumber: row.scaffoldNumber,
      workArea: row.workArea,
      responsibleForemanName: row.responsibleForemanName,
      lastInspectionLabel: formatDate(row.latestFinalizedAt),
      nextDueLabel: row.latestExpiresAt ? tDash("nextDueOn", { date: formatDate(row.latestExpiresAt)! }) : null,
      frequencyLabel,
      stateLabel: tDash(`state.${state}`),
      scaffoldHref: `${basePath}/scaffolds/${row.scaffoldId}`,
      actionHref: canInspect ? `${basePath}/scaffolds/${row.scaffoldId}/inspections/new` : `${basePath}/scaffolds/${row.scaffoldId}`,
      actionLabel: canInspect ? tDash("inspect") : tDash("viewScaffold"),
    };
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <AutoRefresh intervalMs={60000} />
      <PageHeader title={t("title")} description={project.name} actions={<RefreshButton />} />

      <ScaffoldMapPageClient
        entries={entries}
        unlocatedCount={unlocatedCount}
        priorityAwaitingInitial={aggregate.awaitingInitialRows.map(toPriorityRow)}
        priorityExpiredDueToday={aggregate.expiredOrDueTodayRows.map(toPriorityRow)}
        priorityExpiringTomorrow={aggregate.expiringTomorrowRows.map(toPriorityRow)}
      />
    </div>
  );
}
