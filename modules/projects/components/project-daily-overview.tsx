import Link from "next/link";
import { AlertTriangle, CalendarCheck, CheckCircle2, Eye, FileClock, FileQuestion, HardHat, ListChecks, Lock, ShieldAlert, ShieldCheck, UserCheck, UserX, Users } from "lucide-react";
import { SectionHeader } from "@/components/shared/section-header";
import { StatCard } from "@/components/shared/stat-card";

type ProjectDailyOverviewProps = {
  companyId: string;
  projectId: string;
  today: {
    rosterSize: number;
    atWorkCount: number;
    unavailableCount: number;
    notAssignedCount: number;
    assignedCount: number;
    teamCount: number;
    allTeamsLocked: boolean;
    anyTeamsOpen: boolean;
    hoursSubmittedCount: number;
    hoursDraftCount: number;
    hoursNotRecordedCount: number;
  };
  safety: {
    lmraSubmittedToday: number;
    lmraStopWork: number;
    observationsPositiveToday: number;
    observationsNegativeToday: number;
    openCorrectiveActions: number;
    scaffoldsExpiringSoon: number;
    scaffoldsExpired: number;
  };
  actionRequired: {
    openHourDiscrepancies: number;
    overdueCorrectiveActions: number;
    incompleteAttendanceCount: number;
  };
};

/**
 * Project Manager Daily Overview (Phase 7) — every number here is a real,
 * project-scoped query result (listWorkforceForDate/listDailyTeamsForDate
 * for TODAY, the SAME getXxxOverviewCounts()/listOpenWorkedHoursDiscrepancies()
 * functions the company-wide Safety Overview page already uses, just
 * scoped to this one project) — never a fabricated metric. Nothing here
 * duplicates Today's Teams' own page; this is a compact summary with links
 * out to the canonical pages for detail.
 */
export function ProjectDailyOverview({ companyId, projectId, today, safety, actionRequired }: ProjectDailyOverviewProps) {
  const teamsHref = `/companies/${companyId}/projects/${projectId}/teams`;
  const workedHoursHref = `/companies/${companyId}/projects/${projectId}/worked-hours`;
  const hasActionRequired = actionRequired.openHourDiscrepancies > 0 || actionRequired.overdueCorrectiveActions > 0 || actionRequired.incompleteAttendanceCount > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <SectionHeader title="Today" description="Workforce and worked-hours state for today." className="mb-3" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* "At Work" — assigned to a Today's Team (worker or Foreman) OR
              explicitly marked present; never both required. See
              modules/daily-workforce/types.ts's DailyWorkforceSummary doc
              comment for the exact, reconciled definition of every count
              on this row. */}
          <StatCard variant="live" tone="positive" label="At Work" icon={UserCheck} value={today.atWorkCount} href={teamsHref} hint="Assigned to a team or marked present" />
          <StatCard variant="live" tone="attention" label="Not assigned" icon={Users} value={today.notAssignedCount} href={teamsHref} hint="Available but no team yet" />
          <StatCard variant="live" tone="negative" label="Absent / unavailable" icon={UserX} value={today.unavailableCount} href={teamsHref} />
          <StatCard variant="live" tone="info" label="Assigned to teams" icon={HardHat} value={today.assignedCount} href={teamsHref} hint="Workers and Foremen" />
          <StatCard variant="live" label="Today's Teams" icon={CalendarCheck} value={today.teamCount} href={teamsHref} />
          <StatCard
            variant="live"
            label="Team lock status"
            icon={Lock}
            value={today.teamCount === 0 ? "—" : today.allTeamsLocked ? "Locked" : today.anyTeamsOpen ? "Open" : "Mixed"}
            href={teamsHref}
          />
        </div>
      </div>

      <div>
        <SectionHeader title="Worked hours" description="Today's worked-hours entry status, by employee." className="mb-3" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard variant="live" tone="positive" label="Submitted Hours" icon={CheckCircle2} value={today.hoursSubmittedCount} href={workedHoursHref} hint="Finalized for today" />
          <StatCard variant="live" tone="attention" label="Draft Hours" icon={FileClock} value={today.hoursDraftCount} href={workedHoursHref} hint="Entered, not yet submitted" />
          <StatCard variant="live" tone="attention" label="No Hours Recorded" icon={FileQuestion} value={today.hoursNotRecordedCount} href={workedHoursHref} hint="No entry for today at all" />
        </div>
      </div>

      <div>
        <SectionHeader title="Safety today" className="mb-3" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard variant="live" label="LMRAs submitted today" icon={ShieldCheck} value={safety.lmraSubmittedToday} href="/lmra" />
          <StatCard variant="live" label="Stop-work calls" icon={ShieldAlert} value={safety.lmraStopWork} href="/lmra" hint="No-go results" />
          <StatCard variant="live" label="Positive observations" icon={Eye} value={safety.observationsPositiveToday} href="/observations" />
          <StatCard variant="live" label="Negative observations" icon={Eye} value={safety.observationsNegativeToday} href="/observations" />
          <StatCard variant="live" label="Open corrective actions" icon={ListChecks} value={safety.openCorrectiveActions} href="/observations" />
          <StatCard variant="live" label="Scaffold inspections expiring soon" icon={AlertTriangle} value={safety.scaffoldsExpiringSoon} href="/scaffolds" />
          <StatCard variant="live" label="Scaffold inspections expired" icon={AlertTriangle} value={safety.scaffoldsExpired} href="/scaffolds" />
        </div>
      </div>

      {hasActionRequired && (
        <div>
          <SectionHeader title="Action required" className="mb-3" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {actionRequired.openHourDiscrepancies > 0 && (
              <StatCard variant="live" label="Open hour discrepancies" icon={AlertTriangle} value={actionRequired.openHourDiscrepancies} href={workedHoursHref} />
            )}
            {actionRequired.overdueCorrectiveActions > 0 && (
              <StatCard variant="live" label="Overdue corrective actions" icon={AlertTriangle} value={actionRequired.overdueCorrectiveActions} href="/observations?overdueOnly=true" />
            )}
            {actionRequired.incompleteAttendanceCount > 0 && (
              <StatCard variant="live" label="Incomplete daily workforce state" icon={AlertTriangle} value={actionRequired.incompleteAttendanceCount} href={teamsHref} hint="Attendance not yet recorded today" />
            )}
          </div>
        </div>
      )}

      <Link href={`/safety-overview?projectId=${projectId}`} className="text-sm text-primary hover:underline">
        View full safety overview →
      </Link>
    </div>
  );
}
