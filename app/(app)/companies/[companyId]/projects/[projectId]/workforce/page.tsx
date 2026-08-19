import { notFound } from "next/navigation";
import { getTranslations, getFormatter } from "next-intl/server";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames, isPlatformSuperAdmin } from "@/lib/auth/session";
import { getProject, getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { listWorkforceForDate, isCallerProjectAccessible } from "@/modules/daily-workforce/queries";
import { canManageDailyWorkforce, canViewDailyWorkforceBroadly } from "@/modules/daily-workforce/permissions";
import { DailyWorkforceSubnav } from "@/modules/daily-workforce/components/daily-workforce-subnav";
import { DailyWorkforceRoster } from "@/modules/daily-workforce/components/daily-workforce-roster";
import { getProjectLocalDate } from "@/lib/project-date";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Users } from "lucide-react";

type WorkforcePageProps = {
  params: Promise<{ companyId: string; projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

function formatWorkDate(value: string, format: Awaited<ReturnType<typeof getFormatter>>): string {
  return format.dateTime(new Date(`${value}T00:00:00Z`), { weekday: "long", year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
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

  const [roleNames, myProjectRoles, hasProjectAccess, isSuperAdmin] = await Promise.all([
    getUserRoleNames(companyId),
    getMyProjectAssignmentRoles(companyId, projectId, user.id),
    isCallerProjectAccessible(projectId),
    isPlatformSuperAdmin(),
  ]);
  // Part G (Workforce attendance correction): platform_super_admin has
  // global authority here, same OR treatment as every other manage-tier
  // check in this app (e.g. the Equipment page's isSuperAdmin || ...).
  const canManage = isSuperAdmin || canManageDailyWorkforce(roleNames, myProjectRoles);
  const canViewBroadly = isSuperAdmin || canViewDailyWorkforceBroadly(roleNames, hasProjectAccess);

  if (!canManage && !canViewBroadly) notFound();

  const basePath = `/companies/${companyId}/projects/${projectId}/workforce`;
  const [t, format] = await Promise.all([getTranslations("Workforce"), getFormatter()]);
  // Task 3 Part 15 — project-local "today," not the server's.
  const workDate = urlParams.date && /^\d{4}-\d{2}-\d{2}$/.test(urlParams.date) ? urlParams.date : getProjectLocalDate(project.timezone);
  const workforce = await listWorkforceForDate(companyId, projectId, workDate);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title={t("title")} description={`${formatWorkDate(workDate, format)} · ${project.name}`} />

      <DailyWorkforceSubnav companyId={companyId} projectId={projectId} active="workforce" />

      <form action={basePath} method="GET" className="flex items-center gap-2">
        <Input type="date" name="date" defaultValue={workDate} className="w-auto" aria-label={t("selectDate")} />
      </form>

      {workforce.length === 0 ? (
        <EmptyState icon={Users} title={t("noRosterTitle")} className="flex-1" />
      ) : (
        <DailyWorkforceRoster companyId={companyId} projectId={projectId} workDate={workDate} workforce={workforce} canManage={canManage} />
      )}
    </div>
  );
}
