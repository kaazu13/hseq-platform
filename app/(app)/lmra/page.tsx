import Link from "next/link";
import { Plus, ShieldCheck } from "lucide-react";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { resolveCurrentProject, getProject } from "@/modules/projects/queries";
import { listLmraAssessments, listMyLmraAssessments, isCallerProjectForeman, getMyEmployeeId, type LmraListFilters } from "@/modules/lmra/queries";
import { canViewAllProjectLmra } from "@/modules/lmra/permissions";
import { LmraCard } from "@/modules/lmra/components/lmra-card";
import { LmraFilters } from "@/modules/lmra/components/lmra-filters";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

type LmraPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

/**
 * Real LMRA list. Item 6/7's platform-wide rule applies here like every
 * other operational module: the caller's ACTIVE project (resolveCurrentProject,
 * the same resolver every other project-scoped page uses) is the sole
 * source of project scope — there is no LMRA-specific project picker, and
 * no raw project id is ever rendered. RLS (lmra_assessments_select)
 * remains the real access-control layer; this page additionally offers a
 * "My LMRAs" / "All LMRAs" mode (item 8/9) — "My LMRAs" is always
 * available (built from `listMyLmraAssessments`'s completed-by/
 * responsible-person/hazard-responsible/participant union), "All LMRAs"
 * only renders for roles `canViewAllProjectLmra` allows, deliberately
 * narrower than what RLS alone already permits (see that function's own
 * comment for why).
 */
export default async function LmraPage({ searchParams }: LmraPageProps) {
  const params = await searchParams;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="LMRA" description="Last Minute Risk Assessments — a go/no-go check completed before starting work." />
        <EmptyState
          icon={ShieldCheck}
          title="You're not part of an company yet"
          description="Once an administrator adds your account to one, LMRAs will appear here."
          className="flex-1"
        />
      </div>
    );
  }

  const { currentProjectId, projects } = await resolveCurrentProject(user.id, currentCompanyId);

  if (!currentProjectId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="LMRA" description="Last Minute Risk Assessments — a go/no-go check completed before starting work." />
        <EmptyState
          icon={ShieldCheck}
          title="No active project selected"
          description={
            projects.length === 0
              ? "You aren't assigned to a project yet."
              : "Choose a project using the switcher at the top of the page — LMRA always shows your currently active project."
          }
          className="flex-1"
        />
      </div>
    );
  }

  const project = await getProject(currentCompanyId, currentProjectId);
  if (!project) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="LMRA" description="Last Minute Risk Assessments — a go/no-go check completed before starting work." />
        <EmptyState icon={ShieldCheck} title="Project not found" description="Your active project is no longer accessible. Choose another using the switcher at the top of the page." className="flex-1" />
      </div>
    );
  }

  const [roleNames, isForeman, myEmployeeId] = await Promise.all([
    getUserRoleNames(currentCompanyId),
    isCallerProjectForeman(currentCompanyId, currentProjectId, user.id),
    getMyEmployeeId(currentCompanyId, user.id),
  ]);

  const canViewAll = canViewAllProjectLmra(roleNames, isForeman);
  const mode: "my" | "all" = params.mode === "all" && canViewAll ? "all" : "my";

  const filters: Omit<LmraListFilters, "projectId"> = {
    status: params.status,
    workAreaSearch: params.workArea,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  };

  const assessments =
    mode === "all"
      ? await listLmraAssessments(currentCompanyId, { ...filters, projectId: currentProjectId })
      : myEmployeeId
        ? await listMyLmraAssessments(currentCompanyId, currentProjectId, myEmployeeId, filters)
        : [];

  function modeHref(target: "my" | "all"): string {
    const url = new URLSearchParams();
    if (filters.status) url.set("status", filters.status);
    if (filters.workAreaSearch) url.set("workArea", filters.workAreaSearch);
    if (filters.dateFrom) url.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) url.set("dateTo", filters.dateTo);
    if (target === "all") url.set("mode", "all");
    const qs = url.toString();
    return `/lmra${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="LMRA"
        description={`${project.name} · Last Minute Risk Assessments — a go/no-go check completed before starting work.`}
        actions={
          <Button size="sm" nativeButton={false} render={<Link href="/lmra/new" />}>
            <Plus />
            New LMRA
          </Button>
        }
      />

      {canViewAll && (
        <div className="flex gap-2">
          <Button
            variant={mode === "my" ? "default" : "outline"}
            size="sm"
            nativeButton={false}
            render={<Link href={modeHref("my")} />}
            aria-current={mode === "my" ? "page" : undefined}
          >
            My LMRAs
          </Button>
          <Button
            variant={mode === "all" ? "default" : "outline"}
            size="sm"
            nativeButton={false}
            render={<Link href={modeHref("all")} />}
            aria-current={mode === "all" ? "page" : undefined}
          >
            All LMRAs
          </Button>
        </div>
      )}

      <LmraFilters />

      {assessments.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={mode === "all" ? "No LMRAs found" : "You have no LMRAs"}
          description={mode === "all" ? "Try a different filter, or create the first LMRA for this project." : "LMRAs you complete, participate in, or are responsible for will appear here."}
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
            <LmraCard key={assessment.id} assessment={assessment} projectName={project.name} />
          ))}
        </div>
      )}
    </div>
  );
}
