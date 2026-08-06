"use client";

import { useState } from "react";
import { Plus, Users2 } from "lucide-react";
import { TeamCard } from "@/modules/teams/components/team-card";
import { TeamFormDialog } from "@/modules/teams/components/team-form-dialog";
import type { ProjectRosterCandidate, Team, TeamWithAssignments } from "@/modules/teams/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

type TeamsGridProps = {
  companyId: string;
  projectId: string;
  teams: TeamWithAssignments[];
  rosterCandidates: ProjectRosterCandidate[];
  canManage: boolean;
};

/**
 * The Teams page's centerpiece — a card grid, not a table (per this
 * milestone's UI requirement), answering "who is currently working in each
 * team" at a glance. Cards render in `display_order` (never alphabetical —
 * see teams.display_order's column comment); empty teams render normally,
 * with their own card, rather than being hidden.
 */
export function TeamsGrid({ companyId, projectId, teams, rosterCandidates, canManage }: TeamsGridProps) {
  const [dialogState, setDialogState] = useState<{ open: boolean; team?: Team }>({ open: false });
  const orderedTeamIds = teams.map((team) => team.id);

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setDialogState({ open: true, team: undefined })}>
            <Plus />
            Add team
          </Button>
        </div>
      )}

      {teams.length === 0 ? (
        <EmptyState
          icon={Users2}
          title="No teams yet"
          description={canManage ? "Create the first team for this project." : "No teams have been created for this project yet."}
          action={
            canManage ? (
              <Button variant="outline" size="sm" onClick={() => setDialogState({ open: true, team: undefined })}>
                <Plus />
                Add team
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => (
            <TeamCard
              key={team.id}
              companyId={companyId}
              projectId={projectId}
              team={team}
              canManage={canManage}
              orderedTeamIds={orderedTeamIds}
              onEdit={() => setDialogState({ open: true, team })}
            />
          ))}
        </div>
      )}

      {canManage && (
        <TeamFormDialog
          companyId={companyId}
          projectId={projectId}
          team={dialogState.team}
          rosterCandidates={rosterCandidates}
          open={dialogState.open}
          onOpenChange={(open) => setDialogState((previous) => ({ ...previous, open }))}
        />
      )}
    </div>
  );
}
