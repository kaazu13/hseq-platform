import Link from "next/link";
import { FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ToolboxDocumentStatusBadge } from "@/components/shared/toolbox-document-status-badge";
import { formatToolboxMeetingNumberLabel, type ToolboxMeeting } from "@/modules/toolbox-meetings/types";

export function ToolboxMeetingCard({ meeting, projectName }: { meeting: ToolboxMeeting; projectName: string }) {
  return (
    <Link href={`/toolbox-meetings/${meeting.id}`} className="block focus-visible:outline-2 focus-visible:outline-ring">
      <Card className="h-full transition-colors hover:bg-muted/40">
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <FileText className="size-3.5" aria-hidden="true" />
              {formatToolboxMeetingNumberLabel(meeting.meeting_number)}
            </div>
            <ToolboxDocumentStatusBadge status={meeting.status} />
          </div>
          <p className="text-sm font-semibold text-balance">{meeting.title}</p>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <dt>Date</dt>
            <dd className="text-right text-foreground">{meeting.meeting_date}</dd>
            <dt>Project</dt>
            <dd className="truncate text-right text-foreground">{projectName}</dd>
            <dt>Uploaded</dt>
            <dd className="text-right text-foreground">{new Date(meeting.uploaded_at).toLocaleDateString()}</dd>
          </dl>
        </CardContent>
      </Card>
    </Link>
  );
}
