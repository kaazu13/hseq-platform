import Link from "next/link";
import { Eye, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { resolveCurrentOrganization } from "@/modules/organizations/queries";
import { listObservations, type ObservationListFilters } from "@/modules/observations/queries";
import { listProjects } from "@/modules/projects/queries";
import { listActiveEmployeesForPicker } from "@/modules/employees/queries";
import { ObservationCard } from "@/modules/observations/components/observation-card";
import { ObservationFilters } from "@/modules/observations/components/observation-filters";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

type ObservationsPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

/**
 * Safety Observations list — see
 * supabase/migrations/20260802120000_safety_observations_and_corrective_actions.sql
 * and modules/observations/. RLS (safety_observations_select) is the real
 * scoping — org-wide roles see every observation in the organization,
 * project-scoped roles see everything on their assigned project(s), and an
 * Employee sees only what they authored (docs/ROLES_AND_PERMISSIONS.md §5
 * footnote 12) — this page never filters visibility client-side, only the
 * work-area/project/category/risk/status/responsible-person/overdue/date
 * facets in ObservationFilters.
 */
export default async function ObservationsPage({ searchParams }: ObservationsPageProps) {
  const params = await searchParams;
  const { user } = await requireUser();
  const { currentOrganizationId } = await resolveCurrentOrganization(user.id);

  if (!currentOrganizationId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="Safety Observations" description="Site safety observations — positive recognition and safety issues." />
        <EmptyState
          icon={Eye}
          title="You're not part of an organization yet"
          description="Once an administrator adds your account to one, observations will appear here."
          className="flex-1"
        />
      </div>
    );
  }

  const filters: ObservationListFilters = {
    projectId: params.projectId,
    workAreaSearch: params.workArea,
    category: params.category,
    riskLevel: params.riskLevel,
    status: params.status,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    responsiblePersonId: params.responsiblePersonId,
    overdueOnly: params.overdueOnly === "true",
  };

  const [observations, projects, responsiblePersons] = await Promise.all([
    listObservations(currentOrganizationId, filters),
    listProjects(currentOrganizationId),
    listActiveEmployeesForPicker(currentOrganizationId),
  ]);
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Safety Observations"
        description="Site safety observations — positive recognition and safety issues."
        actions={
          <Button size="sm" nativeButton={false} render={<Link href="/observations/new" />}>
            <Plus />
            New observation
          </Button>
        }
      />

      <ObservationFilters projects={projects} responsiblePersons={responsiblePersons} />

      {observations.length === 0 ? (
        <EmptyState
          icon={Eye}
          title="No observations found"
          description="Try a different filter, or report the first observation for a project."
          action={
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/observations/new" />}>
              <Plus />
              New observation
            </Button>
          }
          className="flex-1"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {observations.map((observation) => (
            <ObservationCard key={observation.id} observation={observation} projectName={projectNameById.get(observation.project_id) ?? "Unknown project"} />
          ))}
        </div>
      )}
    </div>
  );
}
