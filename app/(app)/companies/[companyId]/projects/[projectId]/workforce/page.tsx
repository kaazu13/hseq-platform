import { notFound } from "next/navigation";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames } from "@/lib/auth/session";
import { getProject, getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { listWorkforceForDate, isCallerProjectAccessible } from "@/modules/daily-workforce/queries";
import { canManageDailyWorkforce, canViewDailyWorkforceBroadly } from "@/modules/daily-workforce/permissions";
import { DailyWorkforceSubnav } from "@/modules/daily-workforce/components/daily-workforce-subnav";
import { DailyWorkforceRoster } from "@/modules/daily-workforce/components/daily-workforce-roster";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Users } from "lucide-react";

type WorkforcePageProps = {
  params: Promise<{ companyId: string; projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatWorkDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Item 10: Workforce got its own tab — this list used to render underneath
 * every Today's Team card, which became unwieldy past ~30-40 employees.
 * Same underlying listWorkforceForDate() as Teams' own worker pickers —
 * no second, competing roster source.
 */
export default async function WorkforcePage({ params, searchParams }: WorkforcePageProps) {
  const { companyId, projectId } = await params;
  const urlParams = await searchParams;
  const { user } = await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const project = await getProject(companyId, projectId);
  if (!project) notFound();

  const [roleNames, myProjectRoles, hasProjectAccess] = await Promise.all([
    getUserRoleNames(companyId),
    getMyProjectAssignmentRoles(companyId, projectId, user.id),
    isCallerProjectAccessible(projectId),
  ]);
  const canManage = canManageDailyWorkforce(roleNames, myProjectRoles);
  const canViewBroadly = canViewDailyWorkforceBroadly(roleNames, hasProjectAccess);

  if (!canManage && !canViewBroadly) notFound();

  const basePath = `/companies/${companyId}/projects/${projectId}/workforce`;
  const workDate = urlParams.date && /^\d{4}-\d{2}-\d{2}$/.test(urlParams.date) ? urlParams.date : todayIsoDate();
  const workforce = await listWorkforceForDate(companyId, projectId, workDate);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Workforce" description={`${formatWorkDate(workDate)} · ${project.name}`} />

      <DailyWorkforceSubnav companyId={companyId} projectId={projectId} active="workforce" />

      <form action={basePath} method="GET" className="flex items-center gap-2">
        <Input type="date" name="date" defaultValue={workDate} className="w-auto" aria-label="Select date" />
      </form>

      {workforce.length === 0 ? (
        <EmptyState icon={Users} title="No roster for this project yet" className="flex-1" />
      ) : (
        <DailyWorkforceRoster companyId={companyId} projectId={projectId} workDate={workDate} workforce={workforce} canManage={canManage} />
      )}
    </div>
  );
}
