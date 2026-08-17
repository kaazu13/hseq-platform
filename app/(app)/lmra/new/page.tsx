import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { resolveCurrentProject, getProject } from "@/modules/projects/queries";
import { listLmraCandidateEmployees, isCallerProjectForeman, isCallerProjectAccessible, getMyEmployeeId, listDailyTeamsForDate } from "@/modules/lmra/queries";
import { canCreateLmra } from "@/modules/lmra/permissions";
import { initialLmraHazardRows } from "@/modules/lmra/types";
import { LmraForm } from "@/modules/lmra/components/lmra-form";
import { toEmployeeOptions } from "@/modules/employees/employee-options";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { getProjectLocalDate } from "@/lib/project-date";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * New LMRA — the project is resolved from the caller's ACTIVE project
 * context (Phase 2: "resolved from active project context, not manually
 * cross-project selectable"), the same resolveCurrentProject() every other
 * project-scoped page in this app already uses — no LMRA-specific project
 * picker. If no project is currently active, the fix is to pick one via
 * the existing mechanism (dashboard/sidebar switcher), not a second picker
 * built just for LMRA.
 */
type NewLmraPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function NewLmraPage({ searchParams }: NewLmraPageProps) {
  const params = await searchParams;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    forbidden();
  }

  const { currentProjectId } = await resolveCurrentProject(user.id, currentCompanyId);

  if (!currentProjectId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="New LMRA" description="A short, structured go/no-go risk check completed before starting work." />
        <EmptyState
          icon={ShieldCheck}
          title="No active project selected"
          description="Choose a project first — LMRA is always created for your currently active project."
          action={
            <Button size="sm" nativeButton={false} render={<Link href="/dashboard" />}>
              Go to dashboard
            </Button>
          }
          className="flex-1"
        />
      </div>
    );
  }

  const project = await getProject(currentCompanyId, currentProjectId);
  if (!project) {
    notFound();
  }

  const [roleNames, isForeman, hasProjectAccess, myEmployeeId, candidateRows] = await Promise.all([
    getUserRoleNames(currentCompanyId),
    isCallerProjectForeman(currentCompanyId, currentProjectId, user.id),
    isCallerProjectAccessible(currentProjectId),
    getMyEmployeeId(currentCompanyId, user.id),
    listLmraCandidateEmployees(currentCompanyId, currentProjectId),
  ]);

  if (!canCreateLmra(roleNames, hasProjectAccess, isForeman)) {
    forbidden();
  }

  const isElevated = roleNames.includes("hseq_manager") || isForeman;
  if (!isElevated && !myEmployeeId) {
    // Eligible for project access but has no linked employee record in
    // this company — there is no valid "completed by" identity to pin,
    // same guard modules/lmra/actions.ts's requireLmraCreateAccess enforces.
    forbidden();
  }
  // Item 2: WHO may browse and pick ANY of that day's teams via "Select
  // Today's Team" — broader than `isElevated` (which stays narrowly scoped
  // to hseq_manager/foreman for the separate, RLS-backed "set completed-by
  // to someone else" capability). This mirrors listTodaysTeamsForLmra's own
  // read-access fallback (company_admin/operations_manager/hseq_manager),
  // plus project_manager for "higher authorized management" — purely a UI
  // convenience gate, never a security boundary: the underlying read is
  // still RLS-scoped, and every write still goes through the full atomic
  // participant/hazard validation regardless of who clicked the button.
  const canSelectAnyTeam = isElevated || roleNames.includes("company_admin") || roleNames.includes("operations_manager") || roleNames.includes("project_manager");
  const candidates = toEmployeeOptions(candidateRows);
  // Task 3 Part 15 — LMRA's default date is the project's own local "today," not the server's.
  const todayDate = getProjectLocalDate(project.timezone);

  // "Create LMRA for team" from Today's Teams (Phase 9) — pre-populates
  // participants from that day's actual roster, reusing the exact same
  // flatten-foremen-and-workers logic as the in-form "Add Today's Team"
  // dialog (modules/lmra/components/lmra-add-daily-team-dialog.tsx), just
  // triggered on load instead of by a button. Only honored for a team that
  // genuinely belongs to THIS project on the given date — an unrecognized/
  // cross-project id silently falls back to an empty participant list.
  let initialParticipantIds: string[] = [];
  let initialDailyTeamId: string | undefined;
  if (params.dailyTeamId) {
    const teamWorkDate = params.workDate && /^\d{4}-\d{2}-\d{2}$/.test(params.workDate) ? params.workDate : todayDate;
    const teams = await listDailyTeamsForDate(currentCompanyId, currentProjectId, teamWorkDate);
    const team = teams.find((candidate) => candidate.id === params.dailyTeamId);
    if (team) {
      initialParticipantIds = [...(team.foreman ? [team.foreman.id] : []), ...team.workers.map((member) => member.employee.id)];
      initialDailyTeamId = team.id;
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="New LMRA" description={`For ${project.name}.`} />
      <div className="max-w-3xl">
        <LmraForm
          mode="create"
          companyId={currentCompanyId}
          projectId={project.id}
          projectName={project.name}
          candidates={candidates}
          todayDate={todayDate}
          hazardRows={initialLmraHazardRows()}
          participantIds={initialParticipantIds}
          isElevated={isElevated}
          myEmployeeId={myEmployeeId}
          dailyTeamId={initialDailyTeamId}
          canSelectAnyTeam={canSelectAnyTeam}
        />
      </div>
    </div>
  );
}
