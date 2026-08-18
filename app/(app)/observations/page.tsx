import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Eye, Plus } from "lucide-react";
import { requireUser, getUserRoleNames, isEmployeeOnlyAccount } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { listObservations, type ObservationListFilters } from "@/modules/observations/queries";
import { listProjects } from "@/modules/projects/queries";
import { listActiveEmployeesForPicker } from "@/modules/employees/queries";
import { ObservationCard } from "@/modules/observations/components/observation-card";
import { ObservationFilters } from "@/modules/observations/components/observation-filters";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { RefreshButton } from "@/components/shared/refresh-button";
import { CreateSuccessToast } from "@/components/shared/create-success-toast";
import { Button } from "@/components/ui/button";

type ObservationsPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

/**
 * Safety Observations list — see
 * supabase/migrations/20260802120000_safety_observations_and_corrective_actions.sql
 * and modules/observations/. RLS (safety_observations_select) is the real
 * scoping — company-wide roles see every observation in the company,
 * project-scoped roles see everything on their assigned project(s), and a
 * plain Employee sees only observations targeted at them (Employee-role
 * correction milestone — an ordinary worker can no longer author
 * observations at all, see modules/observations/permissions.ts's
 * canCreateObservation) — this page never filters visibility client-side
 * beyond the title/create-button changes below, only the work-area/
 * project/category/risk/status/responsible-person/overdue/date facets in
 * ObservationFilters.
 */
export default async function ObservationsPage({ searchParams }: ObservationsPageProps) {
  const params = await searchParams;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);
  const t = await getTranslations("SafetyObservations");

  if (!currentCompanyId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title={t("title")} description={t("mainDescription")} />
        <EmptyState
          icon={Eye}
          title={t("noCompanyTitle")}
          description={t("noCompanyDescription")}
          className="flex-1"
        />
      </div>
    );
  }

  const roleNames = await getUserRoleNames(currentCompanyId);
  const isPlainEmployee = isEmployeeOnlyAccount(roleNames);

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
    listObservations(currentCompanyId, filters),
    listProjects(currentCompanyId),
    listActiveEmployeesForPicker(currentCompanyId),
  ]);
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <CreateSuccessToast paramName="created" message={t.raw("submittedMessage")} viewHrefTemplate="/observations/{value}" viewLabel={t("viewObservation")} />
      <PageHeader
        title={isPlainEmployee ? t("myObservationsTitle") : t("title")}
        description={isPlainEmployee ? t("myObservationsDescription") : t("mainDescription")}
        actions={
          <>
            <RefreshButton />
            {!isPlainEmployee && (
              <Button size="sm" nativeButton={false} render={<Link href="/observations/new" />}>
                <Plus />
                {t("newObservation")}
              </Button>
            )}
          </>
        }
      />

      <ObservationFilters projects={projects} responsiblePersons={responsiblePersons} />

      {observations.length === 0 ? (
        <EmptyState
          icon={Eye}
          title={t("noObservationsFoundTitle")}
          description={isPlainEmployee ? t("noObservationsEmployeeDescription") : t("noObservationsFoundDescription")}
          action={
            isPlainEmployee ? undefined : (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/observations/new" />}>
                <Plus />
                {t("newObservation")}
              </Button>
            )
          }
          className="flex-1"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {observations.map((observation) => (
            <ObservationCard key={observation.id} observation={observation} projectName={projectNameById.get(observation.project_id) ?? t("unknownProject")} />
          ))}
        </div>
      )}
    </div>
  );
}
