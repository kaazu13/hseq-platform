import Link from "next/link";
import { HardHat, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { listScaffolds, getCurrentInspectionExpiryByScaffold, type ScaffoldListFilters } from "@/modules/scaffolds/queries";
import { listProjects } from "@/modules/projects/queries";
import { ScaffoldCard } from "@/modules/scaffolds/components/scaffold-card";
import { ScaffoldFilters } from "@/modules/scaffolds/components/scaffold-filters";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

type ScaffoldsPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

/**
 * Scaffold register — see
 * supabase/migrations/20260803120000_scaffold_inspections.sql and
 * modules/scaffolds/. RLS (scaffolds_select) is the real scoping — this
 * page never filters visibility client-side, only the work-area/project/
 * type/status facets in ScaffoldFilters.
 */
export default async function ScaffoldsPage({ searchParams }: ScaffoldsPageProps) {
  const params = await searchParams;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="Scaffold Inspections" description="The scaffold register — structures, their inspection history, and current status." />
        <EmptyState icon={HardHat} title="You're not part of an company yet" description="Once an administrator adds your account to one, scaffolds will appear here." className="flex-1" />
      </div>
    );
  }

  const filters: ScaffoldListFilters = {
    projectId: params.projectId,
    workAreaSearch: params.workArea,
    scaffoldType: params.scaffoldType,
    status: params.status,
  };

  const [scaffolds, projects] = await Promise.all([listScaffolds(currentCompanyId, filters), listProjects(currentCompanyId)]);
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
  const expiryByScaffold = await getCurrentInspectionExpiryByScaffold(currentCompanyId, scaffolds.map((s) => s.id));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Scaffold Inspections"
        description="The scaffold register — structures, their inspection history, and current status."
        actions={
          <Button size="sm" nativeButton={false} render={<Link href="/scaffolds/new" />}>
            <Plus />
            Register scaffold
          </Button>
        }
      />

      <ScaffoldFilters projects={projects} />

      {scaffolds.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title="No scaffolds found"
          description="Try a different filter, or register the first scaffold for a project."
          action={
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/scaffolds/new" />}>
              <Plus />
              Register scaffold
            </Button>
          }
          className="flex-1"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {scaffolds.map((scaffold) => (
            <ScaffoldCard key={scaffold.id} scaffold={scaffold} projectName={projectNameById.get(scaffold.project_id) ?? "Unknown project"} currentInspectionExpiresAt={expiryByScaffold.get(scaffold.id) ?? null} />
          ))}
        </div>
      )}
    </div>
  );
}
