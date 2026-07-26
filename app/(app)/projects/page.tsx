import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentOrganization } from "@/modules/organizations/queries";
import { listProjects } from "@/modules/projects/queries";
import { canCreateProjects } from "@/modules/projects/permissions";
import { ProjectCard } from "@/modules/projects/components/project-card";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

/**
 * Real project list, replacing the `ComingSoonPage` placeholder — see
 * docs/PRODUCT_REQUIREMENTS.md's Projects section. RLS
 * (projects_select) is the real scoping: org-wide managers see every
 * project; everyone else sees only projects they're explicitly assigned to
 * (project- or team-level) — this page never has to filter client-side.
 * Cards, not a table, per this milestone's UI requirement — unpaginated
 * (see modules/projects/queries.ts's `listProjects` comment for why).
 */
export default async function ProjectsPage() {
  const { user } = await requireUser();
  const { currentOrganizationId } = await resolveCurrentOrganization(user.id);

  if (!currentOrganizationId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="Projects" description="The contracted jobs and sites your organization is executing." />
        <EmptyState
          icon={FolderKanban}
          title="You're not part of an organization yet"
          description="Once an administrator adds your account to one, projects will appear here."
          className="flex-1"
        />
      </div>
    );
  }

  const roleNames = await getUserRoleNames(currentOrganizationId);
  const canCreate = canCreateProjects(roleNames);
  const projects = await listProjects(currentOrganizationId);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Projects"
        description="The contracted jobs and sites your organization is executing."
        actions={
          canCreate ? (
            <Button size="sm" nativeButton={false} render={<Link href="/projects/new" />}>
              <Plus />
              New project
            </Button>
          ) : undefined
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description={canCreate ? "Create your first project to get started." : "You don't have access to any projects yet."}
          action={
            canCreate ? (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/projects/new" />}>
                <Plus />
                New project
              </Button>
            ) : undefined
          }
          className="flex-1"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
