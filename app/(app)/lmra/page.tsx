import Link from "next/link";
import { Plus, ShieldCheck } from "lucide-react";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { resolveCurrentProject, getProject } from "@/modules/projects/queries";
import { listLmraAssessments, listMyLmraAssessments, countLmraAssessments, countMyLmraAssessments, isCallerProjectForeman, getMyEmployeeId, type LmraListFilters } from "@/modules/lmra/queries";
import { canViewAllProjectLmra } from "@/modules/lmra/permissions";
import { resolveLmraDateRange, LMRA_DEFAULT_DATE_RANGE_PRESET, type LmraDateRangePreset, LMRA_DATE_RANGE_PRESETS } from "@/modules/lmra/types";
import { LmraCard } from "@/modules/lmra/components/lmra-card";
import { LmraFilters } from "@/modules/lmra/components/lmra-filters";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { parsePageParam, parsePageSizeParam, offsetFor, clampPage, totalPagesFor } from "@/lib/pagination";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { RefreshButton } from "@/components/shared/refresh-button";
import { CreateSuccessToast } from "@/components/shared/create-success-toast";
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
 *
 * Post-audit implementation package, Part 7: a visible default date
 * window (Last 30 days — never a silent unbounded fetch) plus real,
 * server-side pagination via the shared PaginationBar/lib/pagination.ts
 * (the same URL-backed page/pageSize convention the employees list uses)
 * — "All time" still paginates rather than ever fetching a project's
 * entire history in one request.
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

  const rangePreset: LmraDateRangePreset = LMRA_DATE_RANGE_PRESETS.includes(params.range as LmraDateRangePreset) ? (params.range as LmraDateRangePreset) : LMRA_DEFAULT_DATE_RANGE_PRESET;
  const { dateFrom, dateTo } = resolveLmraDateRange(rangePreset, { dateFrom: params.dateFrom, dateTo: params.dateTo });

  const filters: Omit<LmraListFilters, "projectId"> = {
    status: params.status,
    workAreaSearch: params.workArea,
    dateFrom,
    dateTo,
  };

  const pageSize = parsePageSizeParam(params.pageSize);
  const requestedPage = parsePageParam(params.page);

  const totalCount =
    mode === "all"
      ? await countLmraAssessments(currentCompanyId, { ...filters, projectId: currentProjectId })
      : myEmployeeId
        ? await countMyLmraAssessments(currentCompanyId, currentProjectId, myEmployeeId, filters)
        : 0;
  const page = clampPage(requestedPage, totalPagesFor(totalCount, pageSize));
  const offset = offsetFor(page, pageSize);

  const assessments =
    mode === "all"
      ? await listLmraAssessments(currentCompanyId, { ...filters, projectId: currentProjectId }, pageSize, offset)
      : myEmployeeId
        ? await listMyLmraAssessments(currentCompanyId, currentProjectId, myEmployeeId, filters, pageSize, offset)
        : [];

  function modeHref(target: "my" | "all"): string {
    const url = new URLSearchParams();
    if (filters.status) url.set("status", filters.status);
    if (filters.workAreaSearch) url.set("workArea", filters.workAreaSearch);
    if (rangePreset !== LMRA_DEFAULT_DATE_RANGE_PRESET) url.set("range", rangePreset);
    if (rangePreset === "custom") {
      if (params.dateFrom) url.set("dateFrom", params.dateFrom);
      if (params.dateTo) url.set("dateTo", params.dateTo);
    }
    if (target === "all") url.set("mode", "all");
    const qs = url.toString();
    return `/lmra${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <CreateSuccessToast paramName="created" buildMessage={() => "LMRA saved successfully."} buildViewHref={(id) => `/lmra/${id}`} viewLabel="View LMRA" />
      <PageHeader
        title="LMRA"
        description={`${project.name} · Last Minute Risk Assessments — a go/no-go check completed before starting work.`}
        actions={
          <>
            <RefreshButton />
            <Button size="sm" nativeButton={false} render={<Link href="/lmra/new" />}>
              <Plus />
              New LMRA
            </Button>
          </>
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

      <LmraFilters activeRangePreset={rangePreset} />

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
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {assessments.map((assessment) => (
              <LmraCard key={assessment.id} assessment={assessment} projectName={project.name} />
            ))}
          </div>
          <PaginationBar page={page} pageSize={pageSize} totalCount={totalCount} itemLabel="LMRAs" />
        </>
      )}
    </div>
  );
}
