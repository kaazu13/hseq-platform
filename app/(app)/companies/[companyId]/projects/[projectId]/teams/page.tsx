import { notFound } from "next/navigation";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames } from "@/lib/auth/session";
import { getProject, getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { listTeamsWithAssignments, listProjectRosterCandidates } from "@/modules/teams/queries";
import { canManageTeams } from "@/modules/teams/permissions";
import { TeamsGrid } from "@/modules/teams/components/teams-grid";
import { PageHeader } from "@/components/shared/page-header";

type TeamsPageProps = {
  params: Promise<{ companyId: string; projectId: string }>;
};

/**
 * Teams — canonical project-scoped route (Planning & Daily nav), promoted
 * out of the project detail page's tab strip (this milestone's explicit
 * requirement: Teams needs its own navigable home, not just a tab buried
 * inside a specific project). Renders the same TeamsGrid the old tab used,
 * reused as-is — no duplicate Teams UI now exists anywhere; the project
 * detail page's Teams tab has been removed in the same change.
 *
 * Authorization hardening: same URL-vs-row cross-check as every other
 * canonical route in this tree — `getProject` returning null 404s before
 * any team data is fetched.
 */
export default async function TeamsPage({ params }: TeamsPageProps) {
  const { companyId, projectId } = await params;
  const { user } = await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const project = await getProject(companyId, projectId);
  if (!project) {
    notFound();
  }

  const [roleNames, myProjectRoles, teams, rosterCandidates] = await Promise.all([
    getUserRoleNames(companyId),
    getMyProjectAssignmentRoles(companyId, projectId, user.id),
    listTeamsWithAssignments(companyId, projectId),
    listProjectRosterCandidates(companyId, projectId),
  ]);
  const canManage = canManageTeams(roleNames, myProjectRoles);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Teams" description={`${project.name} — crews, their foreman, and current roster.`} />
      <TeamsGrid companyId={companyId} projectId={projectId} teams={teams} rosterCandidates={rosterCandidates} canManage={canManage} />
    </div>
  );
}
