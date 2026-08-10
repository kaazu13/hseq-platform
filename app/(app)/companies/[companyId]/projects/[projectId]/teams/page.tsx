import Link from "next/link";
import { notFound } from "next/navigation";
import { HardHat, Lock } from "lucide-react";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames } from "@/lib/auth/session";
import { getProject, getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { listDailyTeamsForDate, listWorkforceForDate, listDailyTeamsArchiveDays, isCallerProjectAccessible } from "@/modules/daily-workforce/queries";
import { canManageDailyWorkforce, canViewDailyWorkforceBroadly } from "@/modules/daily-workforce/permissions";
import { DailyTeamsHeader } from "@/modules/daily-workforce/components/daily-teams-header";
import { DailyTeamCard } from "@/modules/daily-workforce/components/daily-team-card";
import { DailyWorkforceRoster } from "@/modules/daily-workforce/components/daily-workforce-roster";
import { ExportDailyTeamsButton } from "@/modules/daily-workforce/components/export-daily-teams-button";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type TeamsPageProps = {
  params: Promise<{ companyId: string; projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatWorkDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function groupByShift<T extends { shift: string | null }>(items: T[]): { shift: string | null; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.shift ?? "";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([shift, groupItems]) => ({ shift: shift || null, items: groupItems }));
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

  const project = await getProject(companyId, projectId);
  if (!project) {
    notFound();
  }

  const [roleNames, myProjectRoles, hasProjectAccess] = await Promise.all([
    getUserRoleNames(companyId),
    getMyProjectAssignmentRoles(companyId, projectId, user.id),
    isCallerProjectAccessible(projectId),
  ]);
  const canManage = canManageDailyWorkforce(roleNames, myProjectRoles);
  const canViewBroadly = canViewDailyWorkforceBroadly(roleNames, hasProjectAccess);

  const basePath = `/companies/${companyId}/projects/${projectId}/teams`;
  const todayDate = todayIsoDate();

  if (urlParams.view === "archive") {
    const archiveDays = await listDailyTeamsArchiveDays(companyId, projectId);
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="Today's Teams" description={`${project.name} — archive of past workforce allocations.`} />
        <div className="flex items-center gap-2">
          <Link href={basePath} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Today
          </Link>
          <span className="text-sm text-muted-foreground">/</span>
          <span className="text-sm font-medium">Archive</span>
        </div>

        {archiveDays.length === 0 ? (
          <EmptyState icon={HardHat} title="No archived days yet" description="Locked Today's Teams days will appear here." className="flex-1" />
        ) : (
          <div className="flex flex-col gap-2">
            {archiveDays.map((day) => (
              <Link key={day.workDate} href={`${basePath}?date=${day.workDate}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4">
                    <span className="text-sm font-medium">
                      {formatWorkDate(day.workDate)} · {project.name} · {day.workerCount} {day.workerCount === 1 ? "worker" : "workers"}
                    </span>
                    {day.locked && (
                      <Badge variant="secondary" className="gap-1">
                        <Lock className="size-3" />
                        Locked
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

  const [teams, workforce] = await Promise.all([listDailyTeamsForDate(companyId, projectId, workDate), listWorkforceForDate(companyId, projectId, workDate)]);
  const hasOpenTeams = teams.some((team) => team.status === "open");
  const hasLockedTeams = teams.some((team) => team.status === "locked");
  const shiftGroups = groupByShift(teams);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Today's Teams"
        description={`${formatWorkDate(workDate)} · ${project.name}`}
        actions={<ExportDailyTeamsButton companyId={companyId} projectId={projectId} workDate={workDate} className="print:hidden" />}
      />

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Today</span>
        <span className="text-sm text-muted-foreground">/</span>
        <Link href={`${basePath}?view=archive`} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          Archive
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

      {teams.length === 0 ? (
        <EmptyState icon={HardHat} title="No teams yet for this day" description={canManage ? "Add the first team above." : "No teams have been created for this day yet."} />
      ) : (
        <div className="flex flex-col gap-6">
          {shiftGroups.map((group) => (
            <div key={group.shift ?? "__none"} className="flex flex-col gap-3">
              <SectionHeader title={group.shift ?? "Unassigned shift"} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.items.map((team) => (
                  <DailyTeamCard key={team.id} companyId={companyId} projectId={projectId} workDate={workDate} team={team} workforce={workforce} canManage={canManage} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {(canManage || canViewBroadly) && (
        <div className="flex flex-col gap-3">
          <SectionHeader title="Workforce" description="Every project roster employee's status for this day." />
          <DailyWorkforceRoster companyId={companyId} projectId={projectId} workDate={workDate} workforce={workforce} canManage={canManage} />
        </div>
      )}
    </div>
  );
}
