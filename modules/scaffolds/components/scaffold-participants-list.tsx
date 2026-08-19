import type { ScaffoldParticipantDetail } from "@/modules/scaffolds/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type ScaffoldParticipantsListProps = {
  participants: ScaffoldParticipantDetail[];
  manualLabel: string;
  fromTeamLabel: (teamName: string) => string;
};

/**
 * Part 5 — "Erection crew / People involved": the actual participant
 * rows are authoritative (replaces the old team-only presentation).
 * Team context is shown secondarily (a small badge), never the primary
 * unit of display.
 */
export function ScaffoldParticipantsList({ participants, manualLabel, fromTeamLabel }: ScaffoldParticipantsListProps) {
  return (
    <Card>
      <CardContent className="grid grid-cols-1 gap-2 pt-4 sm:grid-cols-2">
        {participants.map((participant) => (
          <div key={participant.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
            <span className="min-w-0 truncate">
              <span className="font-medium">
                {participant.firstName} {participant.lastName}
              </span>
              {participant.positionTitle && <span className="text-muted-foreground"> · {participant.positionTitle}</span>}
            </span>
            <Badge variant="outline" className="shrink-0">
              {participant.source === "team_import" && participant.sourceTeamName ? fromTeamLabel(participant.sourceTeamName) : manualLabel}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
