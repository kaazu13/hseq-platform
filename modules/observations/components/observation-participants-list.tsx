import type { BasicEmployee } from "@/modules/observations/types";

type ObservationParticipantsListProps = {
  participants: { employee_id: string; employee: BasicEmployee }[];
};

/**
 * Read-only "People involved" display for the observation detail page —
 * shows only the people actually linked to this observation, never the
 * full project roster (that's ObservationParticipantsPicker's job, and
 * it's reachable only from the edit page for an authorized editor).
 */
export function ObservationParticipantsList({ participants }: ObservationParticipantsListProps) {
  if (participants.length === 0) {
    return <p className="text-sm text-muted-foreground">No one specifically linked to this observation.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {participants.map(({ employee_id, employee }) => (
        <div key={employee_id} className="text-sm">
          {employee.first_name} {employee.last_name}
          {employee.position_title ? <span className="text-muted-foreground"> — {employee.position_title}</span> : null}
        </div>
      ))}
    </div>
  );
}
