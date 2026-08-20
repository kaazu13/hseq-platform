import Link from "next/link";
import { CalendarCheck, Clock, Eye, Wrench } from "lucide-react";
import type { EmployeeTodayCard } from "@/modules/daily-workforce/queries";
import { DAILY_ATTENDANCE_STATUS_LABELS, DAILY_TEAM_SHIFT_LABELS, dailyAttendancePermitsWork } from "@/modules/daily-workforce/types";
import type { WorkedHours, WorkedHoursDiscrepancy } from "@/modules/worked-hours/types";
import { WORKED_HOURS_DISCREPANCY_STATUS_LABELS, WORKED_HOURS_STATUS_LABELS } from "@/modules/worked-hours/types";
import { StatusBadge } from "@/components/shared/status-badge";
import { workedHoursDiscrepancyStatusTone } from "@/components/shared/status-tone";
import type { SafetyObservation } from "@/modules/observations/types";
import { isPositiveObservation, OBSERVATION_CATEGORY_LABELS } from "@/modules/observations/types";
import type { LmraAssessment } from "@/modules/lmra/types";
import type { ToolboxMeeting } from "@/modules/toolbox-meetings/types";
import type { SafetyFlash } from "@/modules/safety-flash/types";
import type { CorrectiveActionDetail } from "@/modules/corrective-actions/types";
import { ReportDiscrepancyButton } from "@/modules/worked-hours/components/report-discrepancy-button";
import { EmployeeTodaySafetySection } from "@/modules/daily-workforce/components/employee-today-safety-section";
import { ReportAbsenceDialog } from "@/modules/absences/components/report-absence-dialog";
import { RequestLeaveDialog } from "@/modules/leave-requests/components/request-leave-dialog";
import { TeamRoster } from "@/modules/daily-workforce/components/team-roster";
import { RequestEquipmentDialog } from "@/modules/equipment/components/request-equipment-dialog";
import { DirectionsButton } from "@/components/shared/directions-button";
import type { RequestableEquipmentItem } from "@/modules/equipment/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/shared/section-header";

type EmployeeDashboardSectionProps = {
  companyId: string;
  projectId: string;
  myEmployeeId: string;
  todayCard: EmployeeTodayCard;
  phoneByEmployeeId?: Record<string, string | null>;
  /** Task 3 Part 14 — the current project's site location, for the "Directions" link. Null when the project itself couldn't be resolved. */
  siteLocation: { siteLatitude: number | null; siteLongitude: number | null; siteAddress: string | null } | null;
  hoursThisWeek: number;
  monthToDateHours: number;
  daysWorkedThisMonth: number;
  latestWorkedHours: WorkedHours | null;
  discrepancies: WorkedHoursDiscrepancy[];
  observations: SafetyObservation[];
  todaysLmra: LmraAssessment[];
  todaysToolboxMeetings: ToolboxMeeting[];
  activeSafetyFlashes: SafetyFlash[];
  myCorrectiveActions: CorrectiveActionDetail[];
  equipmentCandidateItems: RequestableEquipmentItem[];
};

function formatObservedAt(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * The signed-in user's personal "my own data" section — Phases 1-4 of the
 * Product Integration milestone. Shown at the top of /dashboard (before
 * the manager-facing overview) whenever the caller has a linked employee
 * record in the current company/project. Every data source feeding this is
 * already scoped to THIS employee alone (modules/daily-workforce/queries.ts's
 * getEmployeeTodayCard, modules/worked-hours/queries.ts's own-row/own-
 * discrepancy queries, modules/observations/queries.ts's listMyObservations,
 * modules/lmra/queries.ts's listMyLmraAssessmentsForDate,
 * modules/corrective-actions/queries.ts's listMyCorrectiveActions) — "do
 * not expose other employees' private records" holds by construction, not
 * by a client-side filter. Kept deliberately simple and mobile-first
 * (single column on narrow screens, compact cards, no dense tables) per
 * this milestone's explicit direction.
 */
export function EmployeeDashboardSection({
  companyId,
  projectId,
  myEmployeeId,
  todayCard,
  phoneByEmployeeId,
  siteLocation,
  hoursThisWeek,
  monthToDateHours,
  daysWorkedThisMonth,
  latestWorkedHours,
  discrepancies,
  observations,
  todaysLmra,
  todaysToolboxMeetings,
  activeSafetyFlashes,
  myCorrectiveActions,
  equipmentCandidateItems,
}: EmployeeDashboardSectionProps) {
  const canWork = dailyAttendancePermitsWork(todayCard.attendanceStatus);
  const positiveCount = observations.filter((o) => isPositiveObservation(o)).length;
  const negativeCount = observations.length - positiveCount;
  const openDiscrepancies = discrepancies.filter((d) => d.status === "open");
  const recentObservations = observations.slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium tracking-wide uppercase">
            <CalendarCheck className="size-4" />
            Today
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {todayCard.team ? (
            <>
              <div className="flex items-center gap-2">
                <Badge className="w-fit bg-emerald-500/15 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">At work</Badge>
                <span className="text-sm text-muted-foreground">Status: At Work</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-base font-semibold">{todayCard.team.name}</span>
                <span className="text-sm text-muted-foreground">
                  {[todayCard.team.shift ? DAILY_TEAM_SHIFT_LABELS[todayCard.team.shift] : null, todayCard.team.work_area, todayCard.team.activity].filter(Boolean).join(" · ")}
                </span>
              </div>

              {siteLocation && (
                <div>
                  <DirectionsButton siteLatitude={siteLocation.siteLatitude} siteLongitude={siteLocation.siteLongitude} siteAddress={siteLocation.siteAddress} />
                </div>
              )}

              {/* Task 3 Part 5: structured Foreman + team-member rows (avatar/name/position), replacing the old comma-joined name dump. */}
              <div className="flex flex-col gap-1.5 pt-1">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Your team</span>
                <TeamRoster foreman={todayCard.team.foreman} colleagues={todayCard.team.colleagues} phoneByEmployeeId={phoneByEmployeeId} />
              </div>
            </>
          ) : !canWork ? (
            <>
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="w-fit">
                  {DAILY_ATTENDANCE_STATUS_LABELS[todayCard.attendanceStatus]}
                </Badge>
                <span className="text-sm text-muted-foreground">Status: {DAILY_ATTENDANCE_STATUS_LABELS[todayCard.attendanceStatus]}</span>
              </div>
              <p className="text-sm text-muted-foreground">No team assignment.</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="w-fit">
                  Not assigned
                </Badge>
                <span className="text-sm text-muted-foreground">Status: Not Assigned</span>
              </div>
              <p className="text-sm text-muted-foreground">You are available for work but have not been assigned to a team today.</p>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <SectionHeader title="Quick actions" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <ReportAbsenceDialog companyId={companyId} projectId={projectId} />
          <RequestLeaveDialog companyId={companyId} projectId={projectId} />
          <RequestEquipmentDialog companyId={companyId} projectId={projectId} candidateItems={equipmentCandidateItems} />
          <Button variant="outline" className="h-auto flex-col gap-1.5 py-4" nativeButton={false} render={<Link href="/my-equipment" />}>
            <Wrench className="size-5" />
            <span className="text-sm">My Equipment</span>
          </Button>
          <Button variant="outline" className="h-auto flex-col gap-1.5 py-4" nativeButton={false} render={<Link href="/my-hours" />}>
            <Clock className="size-5" />
            <span className="text-sm">View My Hours</span>
          </Button>
          <Button variant="outline" className="h-auto flex-col gap-1.5 py-4" nativeButton={false} render={<Link href="/observations" />}>
            <Eye className="size-5" />
            <span className="text-sm">My Observations</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Clock className="size-4 text-muted-foreground" />
              Hours
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="flex items-baseline gap-4">
              <div className="flex flex-col">
                <span className="text-2xl font-semibold">{hoursThisWeek.toFixed(1)}h</span>
                <span className="text-xs text-muted-foreground">This week</span>
              </div>
              <div className="flex flex-col">
                <span className="text-2xl font-semibold">{monthToDateHours.toFixed(1)}h</span>
                <span className="text-xs text-muted-foreground">This month · {daysWorkedThisMonth} {daysWorkedThisMonth === 1 ? "day" : "days"} worked</span>
              </div>
            </div>
            {latestWorkedHours && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-sm text-muted-foreground">
                  Latest: {latestWorkedHours.hours}h on {latestWorkedHours.work_date} ({WORKED_HOURS_STATUS_LABELS[latestWorkedHours.status]})
                </span>
                <ReportDiscrepancyButton companyId={companyId} workedHoursId={latestWorkedHours.id} />
              </div>
            )}
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/my-hours" />} className="mt-1 w-fit">
              View My Hours
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Eye className="size-4 text-muted-foreground" />
              My observations
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <span className="text-sm">
              <span className="font-medium text-emerald-700 dark:text-emerald-400">{positiveCount} positive</span> ·{" "}
              <span className="font-medium text-muted-foreground">{negativeCount} other</span>
            </span>
            {recentObservations.length > 0 && (
              <div className="flex flex-col gap-1 border-t pt-2">
                {recentObservations.map((observation) => (
                  <div key={observation.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-muted-foreground">{OBSERVATION_CATEGORY_LABELS[observation.category]}</span>
                    <span className="shrink-0 text-muted-foreground">{formatObservedAt(observation.observed_at)}</span>
                  </div>
                ))}
              </div>
            )}
            <Link href="/observations" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </CardContent>
        </Card>
      </div>

      {openDiscrepancies.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionHeader title="Pending hour corrections" />
          <div className="flex flex-col gap-2">
            {openDiscrepancies.map((d) => (
              <Card key={d.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4">
                  <span className="text-sm">{d.comment}</span>
                  <StatusBadge tone={workedHoursDiscrepancyStatusTone(d.status)}>{WORKED_HOURS_DISCREPANCY_STATUS_LABELS[d.status]}</StatusBadge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <EmployeeTodaySafetySection
        myEmployeeId={myEmployeeId}
        todaysLmra={todaysLmra}
        todaysToolboxMeetings={todaysToolboxMeetings}
        activeSafetyFlashes={activeSafetyFlashes}
        myCorrectiveActions={myCorrectiveActions}
        observationsAboutMe={observations.filter((observation) => observation.target_type === "employee" && observation.target_employee_id === myEmployeeId && observation.observer_id !== myEmployeeId)}
      />
    </div>
  );
}
