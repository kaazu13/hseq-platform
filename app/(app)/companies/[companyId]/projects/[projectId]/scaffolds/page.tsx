import Link from "next/link";
import { notFound } from "next/navigation";
import { HardHat, Plus } from "lucide-react";
import { requireCompanyMembership, requireProjectAccess } from "@/lib/auth/session";
import { getProject } from "@/modules/projects/queries";
import { listScaffolds, getCurrentInspectionExpiryByScaffold, type ScaffoldListFilters } from "@/modules/scaffolds/queries";
import { ScaffoldCard } from "@/modules/scaffolds/components/scaffold-card";
import { ScaffoldFilters } from "@/modules/scaffolds/components/scaffold-filters";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

type ScaffoldsPageProps = {
  params: Promise<{ companyId: string; projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

/**
 * Scaffold register — canonical project-scoped route. RLS (scaffolds_select)
 * is the real scoping — `listScaffolds` never trusts these URL params to
 * decide visibility on its own — but every project-scoped page in this new
 * route tree ALSO independently verifies, beyond RLS, that `companyId` and
 * `projectId` genuinely belong together before rendering anything: RLS only
 * ever answers "is this company/project accessible to me at all," never
 * "does it match what THIS SPECIFIC URL claims" — a URL substitution (a
 * real project id, but under a different company's URL segment) must 404,
 * not silently render the wrong company's chrome around real data.
 */
export default async function ScaffoldsPage({ params, searchParams }: ScaffoldsPageProps) {
  const { companyId, projectId } = await params;
  const urlParams = await searchParams;

  await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const project = await getProject(companyId, projectId);
  if (!project) {
    notFound();
  }

  const filters: ScaffoldListFilters = {
    projectId,
    workAreaSearch: urlParams.workArea,
    scaffoldType: urlParams.scaffoldType,
    status: urlParams.status,
  };

  const scaffolds = await listScaffolds(companyId, filters);
  const expiryByScaffold = await getCurrentInspectionExpiryByScaffold(companyId, scaffolds.map((s) => s.id));
  const basePath = `/companies/${companyId}/projects/${projectId}/scaffolds`;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Scaffold Register"
        description={`${project.name} — structures, their inspection history, and current status.`}
        actions={
          <Button size="sm" nativeButton={false} render={<Link href={`${basePath}/new`} />}>
            <Plus />
            Register scaffold
          </Button>
        }
      />

      <ScaffoldFilters basePath={basePath} />

      {scaffolds.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title="No scaffolds found"
          description="Try a different filter, or register the first scaffold for this project."
          action={
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`${basePath}/new`} />}>
              <Plus />
              Register scaffold
            </Button>
          }
          className="flex-1"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {scaffolds.map((scaffold) => (
            <ScaffoldCard
              key={scaffold.id}
              scaffold={scaffold}
              projectName={project.name}
              currentInspectionExpiresAt={expiryByScaffold.get(scaffold.id) ?? null}
              href={`${basePath}/${scaffold.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
