import Link from "next/link";
import { CalendarCheck, Clock, Eye } from "lucide-react";
import type { EmployeeTodayCard } from "@/modules/daily-workforce/queries";
import { DAILY_ATTENDANCE_STATUS_LABELS, dailyAttendancePermitsWork } from "@/modules/daily-workforce/types";
import type { WorkedHours, WorkedHoursDiscrepancy, AppNotification } from "@/modules/worked-hours/types";
import { WORKED_HOURS_DISCREPANCY_STATUS_LABELS } from "@/modules/worked-hours/types";
import type { SafetyObservation } from "@/modules/observations/types";
import { isPositiveObservationCategory } from "@/modules/observations/types";
import { ReportDiscrepancyButton } from "@/modules/worked-hours/components/report-discrepancy-button";
import { NotificationList } from "@/modules/worked-hours/components/notification-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/shared/section-header";

type EmployeeDashboardSectionProps = {
  companyId: string;
  todayCard: EmployeeTodayCard;
  monthToDateHours: number;
  latestWorkedHours: WorkedHours | null;
  discrepancies: WorkedHoursDiscrepancy[];
  notifications: AppNotification[];
  observations: SafetyObservation[];
};

/**
 * The signed-in user's personal "my own data" section — Phase F. Shown at
 * the top of /dashboard (before the manager-facing overview) whenever the
 * caller has a linked employee record in the current company/project.
 * Every data source feeding this is already scoped to THIS employee alone
 * (modules/daily-workforce/queries.ts's getEmployeeTodayCard,
 * modules/worked-hours/queries.ts's own-row/own-discrepancy queries,
 * modules/observations/queries.ts's listMyObservations) — "do not expose
 * other employees' private records" holds by construction, not by a
 * client-side filter. Kept deliberately simple and mobile-first (single
 * column on narrow screens, compact cards, no dense tables) per this
 * milestone's explicit direction.
 */
export function EmployeeDashboardSection({ companyId, todayCard, monthToDateHours, latestWorkedHours, discrepancies, notifications, observations }: EmployeeDashboardSectionProps) {
  const canWork = dailyAttendancePermitsWork(todayCard.attendanceStatus);
  const positiveCount = observations.filter((o) => isPositiveObservationCategory(o.category) || o.observation_type === "positive").length;
  const negativeCount = observations.length - positiveCount;
  const openDiscrepancies = discrepancies.filter((d) => d.status === "open");

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
              <Badge className="w-fit bg-emerald-500/15 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">At work</Badge>
              <div className="flex flex-col gap-1">
                <span className="text-base font-semibold">{todayCard.team.name}</span>
                {todayCard.team.foremanName && <span className="text-sm text-muted-foreground">Foreman: {todayCard.team.foremanName}</span>}
                {todayCard.team.work_area && <span className="text-sm text-muted-foreground">Area: {todayCard.team.work_area}</span>}
                {todayCard.team.activity && <span className="text-sm text-muted-foreground">Activity: {todayCard.team.activity}</span>}
                {todayCard.team.shift && <span className="text-sm text-muted-foreground">Shift: {todayCard.team.shift}</span>}
              </div>
            </>
          ) : !canWork ? (
            <>
              <Badge variant="destructive" className="w-fit">
                {DAILY_ATTENDANCE_STATUS_LABELS[todayCard.attendanceStatus]}
              </Badge>
              <p className="text-sm text-muted-foreground">You are marked {DAILY_ATTENDANCE_STATUS_LABELS[todayCard.attendanceStatus].toLowerCase()} today. No team assignment.</p>
            </>
          ) : (
            <>
              <Badge variant="secondary" className="w-fit">
                Not assigned
              </Badge>
              <p className="text-sm text-muted-foreground">You have not been assigned to a team today.</p>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Clock className="size-4 text-muted-foreground" />
              Hours this month
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <span className="text-2xl font-semibold">{monthToDateHours.toFixed(1)}h</span>
            {latestWorkedHours && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-sm text-muted-foreground">
                  Latest: {latestWorkedHours.hours}h on {latestWorkedHours.work_date} ({latestWorkedHours.status === "submitted" ? "Submitted" : "Draft"})
                </span>
                <ReportDiscrepancyButton companyId={companyId} workedHoursId={latestWorkedHours.id} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Eye className="size-4 text-muted-foreground" />
              My observations
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <span className="text-sm">
              <span className="font-medium text-emerald-700 dark:text-emerald-400">{positiveCount} positive</span> ·{" "}
              <span className="font-medium text-muted-foreground">{negativeCount} other</span>
            </span>
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
                  <Badge variant="secondary">{WORKED_HOURS_DISCREPANCY_STATUS_LABELS[d.status]}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {notifications.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionHeader title="Notifications" />
          <NotificationList notifications={notifications} />
        </div>
      )}
    </div>
  );
}
