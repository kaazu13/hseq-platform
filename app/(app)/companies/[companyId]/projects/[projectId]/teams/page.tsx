import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getFormatter } from "next-intl/server";
import { HardHat, Lock } from "lucide-react";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames, isEmployeeOnlyAccount } from "@/lib/auth/session";
import { getProject, getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { listDailyTeamsForDate, listWorkforceForDate, listDailyTeamsArchiveDays, listDailyTeamForemanRoster, getEmployeeTodayCard, getMyEmployeeId, getDailyTeamPhoneNumbers } from "@/modules/daily-workforce/queries";
import { listLmraCountsByDailyTeamId } from "@/modules/lmra/queries";
import { canManageDailyWorkforce } from "@/modules/daily-workforce/permissions";
import { groupTeamsByForemanRoster, DAILY_TEAM_STATUS_LABELS } from "@/modules/daily-workforce/types";
import { DailyTeamsHeader } from "@/modules/daily-workforce/components/daily-teams-header";
import { DailyWorkforceSubnav } from "@/modules/daily-workforce/components/daily-workforce-subnav";
import { ForemanSection } from "@/modules/daily-workforce/components/foreman-section";
import { AddForemanButton } from "@/modules/daily-workforce/components/add-foreman-button";
import { ExportDailyTeamsButton } from "@/modules/daily-workforce/components/export-daily-teams-button";
import { CopyTeamsDialog } from "@/modules/daily-workforce/components/copy-teams-dialog";
import { EmployeeDailyTeamCard } from "@/modules/daily-workforce/components/employee-daily-team-card";
import { DateNav } from "@/modules/daily-workforce/components/date-nav";
import { getProjectLocalDate } from "@/lib/project-date";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { RefreshButton } from "@/components/shared/refresh-button";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type TeamsPageProps = {
  params: Promise<{ companyId: string; projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

function formatWorkDate(value: string, format: Awaited<ReturnType<typeof getFormatter>>): string {
  return format.dateTime(new Date(`${value}T00:00:00Z`), { weekday: "long", year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}


/**
 * Today's Teams — canonical project-scoped route (Planning & Daily nav),
 * replacing the old persistent Teams page at this same URL. Defaults to
 * the current server date; `?date=` and `?view=archive` drive the rest.
 * See supabase/migrations/20260812090000_daily_workforce_and_teams.sql's
 * header comment for why this is a NEW, date-scoped model rather than a
 * repurposing of the old teams/team_assignments tables (left untouched,
 * data preserved, simply no longer surfaced in navigation).
 *
 * Authorization hardening: same URL-vs-row cross-check as every other
 * canonical route in this tree — `getProject` returning null 404s before
 * any workforce data is fetched.
 */
export default async function TeamsPage({ params, searchParams }: TeamsPageProps) {
  const { companyId, projectId } = await params;
  const urlParams = await searchParams;
  const { user } = await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);
  const [t, format] = await Promise.all([getTranslations("TodaysTeams"), getFormatter()]);

  const project = await getProject(companyId, projectId);
  if (!project) {
    notFound();
  }

  const [roleNames, myProjectRoles] = await Promise.all([getUserRoleNames(companyId), getMyProjectAssignmentRoles(companyId, projectId, user.id)]);
  const canManage = canManageDailyWorkforce(roleNames, myProjectRoles);

  const basePath = `/companies/${companyId}/projects/${projectId}/teams`;
  // Task 3 Part 15 — "today" for Today's Teams is the PROJECT's own local
  // calendar date, not the server's — a project in a different timezone
  // than the server should see its own actual "today," not one that's
  // already tomorrow (or still yesterday) there.
  const todayDate = getProjectLocalDate(project.timezone);

  // Part 3 (second Employee correction pass): a plain employee gets a
  // genuine personal view here — their own team for the selected date
  // only, never the Workforce/Absent Today/Holiday-Leave tabs, Archive
  // browsing, Export, or any other team's roster. Scoped server-side via
  // getEmployeeTodayCard (queried by employee_id, never client-trusted)
  // and daily_teams_select/daily_team_members_select RLS underneath it —
  // not a UI-only filter. Checked and returned before any of the
  // management branches below so no management data is ever fetched for
  // this caller.
  if (isEmployeeOnlyAccount(roleNames)) {
    const employeeWorkDate = urlParams.date && /^\d{4}-\d{2}-\d{2}$/.test(urlParams.date) ? urlParams.date : todayDate;
    const myEmployeeId = await getMyEmployeeId(companyId, user.id);

    if (!myEmployeeId) {
      return (
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
          <PageHeader title={t("employeeTitle")} description={project.name} />
          <EmptyState icon={HardHat} title={t("noEmployeeRecordTitle")} description={t("noEmployeeRecordDescription")} className="flex-1" />
        </div>
      );
    }

    const todayCard = await getEmployeeTodayCard(companyId, projectId, myEmployeeId, employeeWorkDate);
    const [lmraEntries, phoneByEmployeeId] = await Promise.all([
      todayCard.team ? (await listLmraCountsByDailyTeamId(companyId, projectId, employeeWorkDate)).get(todayCard.team.id) ?? [] : [],
      todayCard.team ? getDailyTeamPhoneNumbers(todayCard.team.id) : Promise.resolve({}),
    ]);

    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title={t("employeeTitle")} description={`${formatWorkDate(employeeWorkDate, format)} · ${project.name}`} actions={<RefreshButton />} />

        <DateNav basePath={basePath} workDate={employeeWorkDate} todayDate={todayDate} />

        {todayCard.team ? (
          <EmployeeDailyTeamCard workDate={employeeWorkDate} team={todayCard.team} lmraEntries={lmraEntries} phoneByEmployeeId={phoneByEmployeeId} />
        ) : (
          <EmptyState icon={HardHat} title={t("noTeamAssignedTitle")} className="flex-1" />
        )}
      </div>
    );
  }

  if (urlParams.view === "archive") {
    const archiveDays = await listDailyTeamsArchiveDays(companyId, projectId);
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title={t("title")} description={t("archiveDescription", { project: project.name })} />
        <DailyWorkforceSubnav companyId={companyId} projectId={projectId} active="teams" />
        <div className="flex items-center gap-2">
          <Link href={basePath} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            {t("today")}
          </Link>
          <span className="text-sm text-muted-foreground">/</span>
          <span className="text-sm font-medium">{t("archive")}</span>
        </div>

        {archiveDays.length === 0 ? (
          <EmptyState icon={HardHat} title={t("noArchivedDaysTitle")} description={t("noArchivedDaysDescription")} className="flex-1" />
        ) : (
          <div className="flex flex-col gap-2">
            {archiveDays.map((day) => (
              <Link key={day.workDate} href={`${basePath}?date=${day.workDate}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4">
                    <span className="text-sm font-medium">
                      {formatWorkDate(day.workDate, format)} · {project.name} · {t("workerCount", { count: day.workerCount })}
                    </span>
                    {day.locked && (
                      <Badge variant="secondary" className="gap-1">
                        <Lock className="size-3" />
                        {DAILY_TEAM_STATUS_LABELS.locked}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  const workDate = urlParams.date && /^\d{4}-\d{2}-\d{2}$/.test(urlParams.date) ? urlParams.date : todayDate;

  const [teams, workforce, roster, lmraCountsByTeamIdMap] = await Promise.all([
    listDailyTeamsForDate(companyId, projectId, workDate),
    listWorkforceForDate(companyId, projectId, workDate),
    listDailyTeamForemanRoster(companyId, projectId, workDate),
    listLmraCountsByDailyTeamId(companyId, projectId, workDate),
  ]);
  const hasOpenTeams = teams.some((team) => team.status === "open");
  const hasLockedTeams = teams.some((team) => team.status === "locked");
  const foremanGroups = groupTeamsByForemanRoster(roster, teams);
  const lmraCountsByTeamId = Object.fromEntries(lmraCountsByTeamIdMap);
  const rosterForemanIds = roster.map((entry) => entry.foremanEmployeeId);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      {/* Only the live "today" view polls — the archive view (returned earlier above) renders historical, no-longer-changing days. */}
      <AutoRefresh intervalMs={60000} />
      <PageHeader
        title={t("title")}
        description={`${formatWorkDate(workDate, format)} · ${project.name}`}
        actions={
          <>
            <RefreshButton />
            <ExportDailyTeamsButton companyId={companyId} projectId={projectId} workDate={workDate} className="print:hidden" />
          </>
        }
      />

      <DailyWorkforceSubnav companyId={companyId} projectId={projectId} active="teams" />

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{t("today")}</span>
        <span className="text-sm text-muted-foreground">/</span>
        <Link href={`${basePath}?view=archive`} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          {t("archive")}
        </Link>
      </div>

      <DailyTeamsHeader
        companyId={companyId}
        projectId={projectId}
        basePath={basePath}
        workDate={workDate}
        todayDate={todayDate}
        hasOpenTeams={hasOpenTeams}
        hasLockedTeams={hasLockedTeams}
        canManage={canManage}
      />

      {foremanGroups.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title={t("noForemenTitle")}
          description={canManage ? t("noForemenDescriptionManage") : t("noForemenDescriptionView")}
          action={canManage ? <CopyTeamsDialog companyId={companyId} projectId={projectId} destinationWorkDate={workDate} /> : undefined}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {foremanGroups.map((group) => (
            <ForemanSection
              key={group.foremanId ?? "__none"}
              companyId={companyId}
              projectId={projectId}
              workDate={workDate}
              canManage={canManage}
              foremanId={group.foremanId}
              foremanName={group.foremanName}
              teams={group.items}
              workforce={workforce}
              lmraCountsByTeamId={lmraCountsByTeamId}
            />
          ))}
        </div>
      )}

      {canManage && (
        <div>
          <AddForemanButton companyId={companyId} projectId={projectId} workDate={workDate} workforce={workforce} rosterForemanIds={rosterForemanIds} />
        </div>
      )}
    </div>
  );
}
