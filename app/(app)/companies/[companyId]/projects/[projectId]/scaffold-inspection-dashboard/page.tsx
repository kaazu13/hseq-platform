import { notFound } from "next/navigation";
import { getTranslations, getFormatter } from "next-intl/server";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames, isPlatformSuperAdmin } from "@/lib/auth/session";
import { getProject } from "@/modules/projects/queries";
import { canViewInspectionDashboard, canManageScaffold } from "@/modules/scaffolds/permissions";
import { getScaffoldInspectionOverview, listRecentInspections, listInspectorsToday } from "@/modules/scaffolds/queries";
import { computeInspectionDashboardAggregate, resolveInspectionHealth } from "@/modules/scaffolds/inspection-health";
import { formatInspectionInterval, formatInspectionReference, SCAFFOLD_INSPECTION_OUTCOME_LABELS } from "@/modules/scaffolds/types";
import { InspectionKpiCards } from "@/modules/scaffolds/components/inspection-kpi-cards";
import { InspectionHealthDonut } from "@/modules/scaffolds/components/inspection-health-donut";
import { InspectionPrioritySection, type PriorityRow } from "@/modules/scaffolds/components/inspection-priority-section";
import { LatestInspectionsList, type LatestInspectionRow } from "@/modules/scaffolds/components/latest-inspections-list";
import { InspectorsTodayCard, type InspectorTodayDisplayRow } from "@/modules/scaffolds/components/inspectors-today-card";
import { getProjectLocalDate } from "@/lib/project-date";
import { PageHeader } from "@/components/shared/page-header";
import { RefreshButton } from "@/components/shared/refresh-button";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

type InspectionDashboardPageProps = {
  params: Promise<{ companyId: string; projectId: string }>;
};

const ATTENDANCE_STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  present: "default",
  not_set: "outline",
  absent: "destructive",
  sick: "destructive",
  leave: "secondary",
  training: "secondary",
  off_site: "secondary",
};

/**
 * Scaffold Inspection Dashboard (Parts H-N) — ONE aggregate query
 * (getScaffoldInspectionOverview) backs the KPI cards, health donut, and
 * priority lists; a second, separately-bounded query backs Latest
 * Inspections (LIMIT 10); a third backs Inspectors Today. No per-KPI
 * query, no N+1 per scaffold (Part AE). AutoRefresh + RefreshButton (Part
 * AD) — same lightweight polling/manual-refresh pattern already used by
 * Today's Teams, not a new realtime subscription.
 */
export default async function InspectionDashboardPage({ params }: InspectionDashboardPageProps) {
  const { companyId, projectId } = await params;
  await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const project = await getProject(companyId, projectId);
  if (!project) notFound();

  const [roleNames, isSuperAdmin] = await Promise.all([getUserRoleNames(companyId), isPlatformSuperAdmin()]);
  const canView = isSuperAdmin || canViewInspectionDashboard(roleNames, true);
  if (!canView) notFound();
  const canInspect = isSuperAdmin || canManageScaffold(roleNames, true);

  const [t, format] = await Promise.all([getTranslations("InspectionDashboard"), getFormatter()]);
  const todayDate = getProjectLocalDate(project.timezone);

  const [overview, recentInspections, inspectorsToday] = await Promise.all([
    getScaffoldInspectionOverview(projectId),
    listRecentInspections(companyId, projectId, 10),
    listInspectorsToday(projectId, todayDate),
  ]);

  const aggregate = computeInspectionDashboardAggregate(overview, todayDate);

  const basePath = `/companies/${companyId}/projects/${projectId}`;

  function formatDate(value: string | null): string | null {
    return value ? format.dateTime(new Date(value), { dateStyle: "medium" }) : null;
  }
  function formatDateTime(value: string | null): string | null {
    return value ? format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" }) : null;
  }

  function toPriorityRow(row: (typeof overview)[number]): PriorityRow {
    const state = resolveInspectionHealth(row.status, row.latestExpiresAt, todayDate);
    return {
      scaffoldId: row.scaffoldId,
      scaffoldNumber: row.scaffoldNumber,
      workArea: row.workArea,
      responsibleForemanName: row.responsibleForemanName,
      lastInspectionLabel: formatDate(row.latestFinalizedAt),
      nextDueLabel: row.latestExpiresAt ? t("nextDueOn", { date: formatDate(row.latestExpiresAt)! }) : null,
      frequencyLabel: row.latestIntervalType && row.latestIntervalDays ? formatInspectionInterval(row.latestIntervalType, row.latestIntervalDays, (days) => t("everyNDays", { days })) : t("notYetSet"),
      stateLabel: t(`state.${state}`),
      scaffoldHref: `${basePath}/scaffolds/${row.scaffoldId}`,
      actionHref: canInspect ? `${basePath}/scaffolds/${row.scaffoldId}/inspections/new` : `${basePath}/scaffolds/${row.scaffoldId}`,
      actionLabel: canInspect ? t("inspect") : t("viewScaffold"),
    };
  }

  const kpis = [
    { label: t("totalScaffoldsCreated"), value: aggregate.totalScaffoldsCreated },
    { label: t("activeScaffolds"), value: aggregate.activeScaffolds },
    { label: t("dismantledArchived"), value: aggregate.dismantledArchived },
    { label: t("currentlyValid"), value: aggregate.currentlyValid },
    { label: t("expiredOrDueToday"), value: aggregate.expiredOrDueToday },
    { label: t("expiringTomorrow"), value: aggregate.expiringTomorrow },
    { label: t("awaitingInitialInspection"), value: aggregate.awaitingInitialInspection },
  ];

  const chartSlices = aggregate.chartSlices.map((slice) => ({ bucket: slice.bucket, count: slice.count, label: t(`chartBucket.${slice.bucket}`) }));

  const latestRows: LatestInspectionRow[] = recentInspections.map((inspection) => ({
    inspectionId: inspection.id,
    reference: formatInspectionReference(inspection.scaffold, inspection),
    scaffoldNumber: inspection.scaffold.scaffold_number,
    workArea: inspection.scaffold.work_area,
    inspectorName: inspection.inspector ? `${inspection.inspector.first_name} ${inspection.inspector.last_name}` : t("notAvailable"),
    finalizedAtLabel: formatDateTime(inspection.finalized_at) ?? t("notAvailable"),
    outcomeLabel: inspection.outcome ? SCAFFOLD_INSPECTION_OUTCOME_LABELS[inspection.outcome] : t("notAvailable"),
    nextDueLabel: inspection.expires_at ? t("nextDueOn", { date: formatDate(inspection.expires_at)! }) : null,
    statusLabel: t(`state.${resolveInspectionHealth("safe", inspection.expires_at, todayDate)}`),
    href: `${basePath}/scaffolds/${inspection.scaffold.id}/inspections/${inspection.id}`,
  }));

  const inspectorRows: InspectorTodayDisplayRow[] = inspectorsToday.map((row) => ({
    employeeId: row.employeeId,
    name: `${row.firstName} ${row.lastName}`,
    statusLabel: t(`attendanceStatus.${row.attendanceStatus}` as "attendanceStatus.present"),
    statusVariant: ATTENDANCE_STATUS_VARIANT[row.attendanceStatus] ?? "outline",
    finalizedInspectionsToday: row.finalizedInspectionsToday,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <AutoRefresh intervalMs={60000} />
      <PageHeader title={t("title")} description={project.name} actions={<RefreshButton />} />

      <InspectionKpiCards kpis={kpis} />

      <Card>
        <CardHeader>
          <CardTitle>{t("healthChartTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <InspectionHealthDonut slices={chartSlices} total={aggregate.activeScaffolds} centerLabel={t("activeScaffolds")} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">{t("priorityTitle")}</h2>
        <InspectionPrioritySection
          title={t("priorityAwaitingInitial")}
          accentClassName="bg-gray-400"
          rows={aggregate.awaitingInitialRows.map(toPriorityRow)}
          emptyLabel={t("priorityEmpty")}
          scaffoldNumberPrefix="SC-"
          notInspectedLabel={t("notYetInspected")}
          viewScaffoldLabel={t("viewScaffold")}
        />
        <InspectionPrioritySection
          title={t("priorityExpiredDueToday")}
          accentClassName="bg-red-600"
          rows={aggregate.expiredOrDueTodayRows.map(toPriorityRow)}
          emptyLabel={t("priorityEmpty")}
          scaffoldNumberPrefix="SC-"
          notInspectedLabel={t("notYetInspected")}
          viewScaffoldLabel={t("viewScaffold")}
        />
        <InspectionPrioritySection
          title={t("priorityExpiringTomorrow")}
          accentClassName="bg-amber-500"
          rows={aggregate.expiringTomorrowRows.map(toPriorityRow)}
          emptyLabel={t("priorityEmpty")}
          scaffoldNumberPrefix="SC-"
          notInspectedLabel={t("notYetInspected")}
          viewScaffoldLabel={t("viewScaffold")}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{t("latestInspectionsTitle")}</h2>
          <Link href={`${basePath}/scaffold-inspections`} className="text-sm font-medium text-primary underline-offset-2 hover:underline">
            {t("viewAllInspections")} →
          </Link>
        </div>
        <LatestInspectionsList rows={latestRows} emptyLabel={t("latestInspectionsEmpty")} scaffoldNumberPrefix="SC-" />
      </div>

      <InspectorsTodayCard
        title={t("inspectorsTodayTitle")}
        rows={inspectorRows}
        summaryLabel={(count, statusLabel) => t("inspectorsSummary", { count, status: statusLabel })}
        emptyLabel={t("inspectorsTodayEmpty")}
        finalizedTodayLabel={(count) => t("finalizedToday", { count })}
      />
    </div>
  );
}
