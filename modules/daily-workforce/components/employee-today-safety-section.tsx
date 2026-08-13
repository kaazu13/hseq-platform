import Link from "next/link";
import { ClipboardList, Eye, MessagesSquare, ShieldCheck, Siren } from "lucide-react";
import type { LmraAssessment } from "@/modules/lmra/types";
import { LMRA_STATUS_LABELS } from "@/modules/lmra/types";
import type { ToolboxMeeting } from "@/modules/toolbox-meetings/types";
import type { SafetyFlash } from "@/modules/safety-flash/types";
import type { SafetyObservation } from "@/modules/observations/types";
import { OBSERVATION_TYPE_LABELS } from "@/modules/observations/types";
import type { CorrectiveActionDetail } from "@/modules/corrective-actions/types";
import { CorrectiveActionStatusBadge } from "@/modules/corrective-actions/components/corrective-action-status-badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { lmraStatusTone, observationTypeTone } from "@/components/shared/status-tone";
import { SectionHeader } from "@/components/shared/section-header";
import { Card, CardContent } from "@/components/ui/card";

type EmployeeTodaySafetySectionProps = {
  myEmployeeId: string;
  todaysLmra: LmraAssessment[];
  todaysToolboxMeetings: ToolboxMeeting[];
  activeSafetyFlashes: SafetyFlash[];
  myCorrectiveActions: CorrectiveActionDetail[];
  /** Safety Observations where the caller is the TARGET, not the observer — reported ABOUT them, never their own submitted observations (those already have their own "My observations" card elsewhere on this dashboard, and mixing the two here would misrepresent "why you see this" as identical for two different relationships). */
  observationsAboutMe: SafetyObservation[];
};

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * "My Safety Today" (renamed from "Today's Safety" — item 1). Built
 * entirely from records that already exist and already carry a real,
 * resolvable relationship to the caller — no invented attendance/
 * acknowledgement state for Toolbox Meetings/Safety Flash, since that data
 * model deliberately doesn't track one (document-based evidence records,
 * see modules/toolbox-meetings/types.ts's header comment). Every row
 * follows the same shape: record type, title, WHY the caller sees it
 * (their actual relationship to the record, resolved server-side from
 * real columns — never a guess), and status where the record type
 * actually has one. Renders nothing at all when every list is empty,
 * matching this dashboard's existing "no empty section chrome" convention.
 */
export function EmployeeTodaySafetySection({ myEmployeeId, todaysLmra, todaysToolboxMeetings, activeSafetyFlashes, myCorrectiveActions, observationsAboutMe }: EmployeeTodaySafetySectionProps) {
  const hasAnything = todaysLmra.length > 0 || todaysToolboxMeetings.length > 0 || activeSafetyFlashes.length > 0 || myCorrectiveActions.length > 0 || observationsAboutMe.length > 0;
  if (!hasAnything) return null;

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader title="My Safety Today" />
      <div className="flex flex-col gap-2">
        {todaysLmra.map((assessment) => (
          <Card key={`lmra-${assessment.id}`}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4">
              <Link href={`/lmra/${assessment.id}`} className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <ShieldCheck className="size-3.5 shrink-0" />
                  LMRA
                </span>
                <span className="truncate text-sm font-medium hover:underline">{assessment.work_activity}</span>
                <span className="text-xs text-muted-foreground">{assessment.completed_by_employee_id === myEmployeeId ? "You completed this assessment" : "You are a participant"}</span>
              </Link>
              <StatusBadge tone={lmraStatusTone(assessment.status)}>{LMRA_STATUS_LABELS[assessment.status]}</StatusBadge>
            </CardContent>
          </Card>
        ))}

        {todaysToolboxMeetings.map((meeting) => (
          <Card key={`toolbox-${meeting.id}`}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4">
              <Link href={`/toolbox-meetings/${meeting.id}`} className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <MessagesSquare className="size-3.5 shrink-0" />
                  Toolbox Meeting
                </span>
                <span className="truncate text-sm font-medium hover:underline">{meeting.title}</span>
                <span className="text-xs text-muted-foreground">Recorded for your project today</span>
              </Link>
            </CardContent>
          </Card>
        ))}

        {activeSafetyFlashes.map((flash) => (
          <Card key={`flash-${flash.id}`}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4">
              <Link href={`/toolbox-meetings/safety-flash/${flash.id}`} className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <Siren className="size-3.5 shrink-0" />
                  Safety Flash
                </span>
                <span className="truncate text-sm font-medium hover:underline">{flash.title}</span>
                <span className="text-xs text-muted-foreground">{flash.project_id ? "Active for your project" : "Active company-wide"} · {formatDate(flash.date_issued)}</span>
              </Link>
            </CardContent>
          </Card>
        ))}

        {observationsAboutMe.map((observation) => (
          <Card key={`observation-${observation.id}`}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4">
              <Link href={`/observations/${observation.id}`} className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <Eye className="size-3.5 shrink-0" />
                  Safety Observation
                </span>
                <span className="truncate text-sm font-medium hover:underline">{observation.description}</span>
                <span className="text-xs text-muted-foreground">Observation about you</span>
              </Link>
              <StatusBadge tone={observationTypeTone(observation.observation_type ?? "general")}>{OBSERVATION_TYPE_LABELS[observation.observation_type ?? "general"]}</StatusBadge>
            </CardContent>
          </Card>
        ))}

        {myCorrectiveActions.map((action) => (
          <Card key={`action-${action.id}`}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4">
              <Link href={`/observations/${action.observation_id}`} className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <ClipboardList className="size-3.5 shrink-0" />
                  Corrective Action
                </span>
                <span className="truncate text-sm font-medium hover:underline">{action.description}</span>
                <span className="text-xs text-muted-foreground">Assigned to you · Due {formatDate(action.due_date)}</span>
              </Link>
              <CorrectiveActionStatusBadge dueDate={action.due_date} status={action.status} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
