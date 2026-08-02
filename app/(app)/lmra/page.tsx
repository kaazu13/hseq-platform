import Link from "next/link";
import { Plus, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { resolveCurrentOrganization } from "@/modules/organizations/queries";
import { listLmraAssessments, type LmraListFilters } from "@/modules/lmra/queries";
import { listProjects } from "@/modules/projects/queries";
import { LmraCard } from "@/modules/lmra/components/lmra-card";
import { LmraFilters } from "@/modules/lmra/components/lmra-filters";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

type LmraPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

/**
 * Real LMRA list, replacing the `ComingSoonPage` placeholder — see
 * docs/DATABASE_SCHEMA.md's `lmra_assessments` section and
 * supabase/migrations/20260801090000_lmra.sql. RLS (lmra_assessments_select)
 * is the real scoping (org-wide HSE/company roles see every assessment in
 * the organization; everyone else only what has_project_access() grants
 * them) — this page never filters visibility client-side, only the
 * work-area/status/project/date facets in LmraFilters.
 *
 * "New LMRA" always links to /lmra/new, which does its own project-picker
 * and eligibility check (docs/ROLES_AND_PERMISSIONS.md §5's LMRA row is
 * project-scoped, not a single org-wide "can create" flag — see
 * modules/lmra/queries.ts's listLmraCreatableProjects).
 */
export default async function LmraPage({ searchParams }: LmraPageProps) {
  const params = await searchParams;
  const { user } = await requireUser();
  const { currentOrganizationId } = await resolveCurrentOrganization(user.id);

  if (!currentOrganizationId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="LMRA" description="Last Minute Risk Assessments — a go/no-go check completed before starting work." />
        <EmptyState
          icon={ShieldCheck}
          title="You're not part of an organization yet"
          description="Once an administrator adds your account to one, LMRAs will appear here."
          className="flex-1"
        />
      </div>
    );
  }

  const filters: LmraListFilters = {
    projectId: params.projectId,
    status: params.status,
    workAreaSearch: params.workArea,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  };

  const [assessments, projects] = await Promise.all([
    listLmraAssessments(currentOrganizationId, filters),
    listProjects(currentOrganizationId),
  ]);
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="LMRA"
        description="Last Minute Risk Assessments — a go/no-go check completed before starting work."
        actions={
          <Button size="sm" nativeButton={false} render={<Link href="/lmra/new" />}>
            <Plus />
            New LMRA
          </Button>
        }
      />

      <LmraFilters projects={projects} />

      {assessments.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No LMRAs found"
          description="Try a different filter, or create the first LMRA for a project."
          action={
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/lmra/new" />}>
              <Plus />
              New LMRA
            </Button>
          }
          className="flex-1"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {assessments.map((assessment) => (
            <LmraCard key={assessment.id} assessment={assessment} projectName={projectNameById.get(assessment.project_id) ?? "Unknown project"} />
          ))}
        </div>
      )}
    </div>
  );
}
