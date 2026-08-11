import Link from "next/link";
import { ClipboardList, MessagesSquare, ShieldCheck, Siren } from "lucide-react";
import type { LmraAssessment } from "@/modules/lmra/types";
import { LMRA_STATUS_LABELS } from "@/modules/lmra/types";
import type { ToolboxMeeting } from "@/modules/toolbox-meetings/types";
import type { SafetyFlash } from "@/modules/safety-flash/types";
import type { CorrectiveActionDetail } from "@/modules/corrective-actions/types";
import { CorrectiveActionStatusBadge } from "@/modules/corrective-actions/components/corrective-action-status-badge";
import { SectionHeader } from "@/components/shared/section-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type EmployeeTodaySafetySectionProps = {
  todaysLmra: LmraAssessment[];
  todaysToolboxMeetings: ToolboxMeeting[];
  activeSafetyFlashes: SafetyFlash[];
  myCorrectiveActions: CorrectiveActionDetail[];
};

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * "Today's Safety" — Phase 4. Built entirely from records that already
 * exist (today's LMRAs the employee participates in, today's Toolbox
 * Meetings for their project, active Safety Flashes covering their
 * project, and their own open corrective actions) — no invented
 * attendance/acknowledgement state for Toolbox Meetings/Safety Flash,
 * since that data model deliberately doesn't track one (document-based
 * evidence records, see modules/toolbox-meetings/types.ts's header
 * comment). Renders nothing at all when every list is empty, matching
 * this dashboard's existing "no empty section chrome" convention.
 */
export function EmployeeTodaySafetySection({ todaysLmra, todaysToolboxMeetings, activeSafetyFlashes, myCorrectiveActions }: EmployeeTodaySafetySectionProps) {
  const hasAnything = todaysLmra.length > 0 || todaysToolboxMeetings.length > 0 || activeSafetyFlashes.length > 0 || myCorrectiveActions.length > 0;
  if (!hasAnything) return null;

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader title="Today's safety" />
      <div className="flex flex-col gap-2">
        {todaysLmra.map((assessment) => (
          <Card key={assessment.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4">
              <Link href={`/lmra/${assessment.id}`} className="flex min-w-0 items-center gap-2 text-sm font-medium hover:underline">
                <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{assessment.work_activity}</span>
              </Link>
              <Badge variant="secondary">{LMRA_STATUS_LABELS[assessment.status]}</Badge>
            </CardContent>
          </Card>
        ))}

        {todaysToolboxMeetings.map((meeting) => (
          <Card key={meeting.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4">
              <Link href={`/toolbox-meetings/${meeting.id}`} className="flex min-w-0 items-center gap-2 text-sm font-medium hover:underline">
                <MessagesSquare className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{meeting.title}</span>
              </Link>
              <span className="text-xs text-muted-foreground">Toolbox meeting</span>
            </CardContent>
          </Card>
        ))}

        {activeSafetyFlashes.map((flash) => (
          <Card key={flash.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4">
              <Link href={`/toolbox-meetings/safety-flash/${flash.id}`} className="flex min-w-0 items-center gap-2 text-sm font-medium hover:underline">
                <Siren className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{flash.title}</span>
              </Link>
              <span className="text-xs text-muted-foreground">{formatDate(flash.date_issued)}</span>
            </CardContent>
          </Card>
        ))}

        {myCorrectiveActions.map((action) => (
          <Card key={action.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4">
              <Link href={`/observations/${action.observation_id}`} className="flex min-w-0 items-center gap-2 text-sm font-medium hover:underline">
                <ClipboardList className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{action.description}</span>
              </Link>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Due {formatDate(action.due_date)}</span>
                <CorrectiveActionStatusBadge dueDate={action.due_date} status={action.status} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
