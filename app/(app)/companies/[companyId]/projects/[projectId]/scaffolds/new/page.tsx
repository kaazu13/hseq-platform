import { notFound, forbidden } from "next/navigation";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames } from "@/lib/auth/session";
import { getProject } from "@/modules/projects/queries";
import { listScaffoldRegisterCreatableProjects, listEligibleScaffoldForemen, isCallerEligibleScaffoldForeman, getEffectiveInspectionIntervalForProject } from "@/modules/scaffolds/queries";
import { isScaffoldBroadCreator, mustSelfLockResponsibleForeman } from "@/modules/scaffolds/permissions";
import { getMyEmployeeId } from "@/modules/daily-workforce/queries";
import { ScaffoldForm } from "@/modules/scaffolds/components/scaffold-form";
import { getProjectLocalDate } from "@/lib/project-date";
import { PageHeader } from "@/components/shared/page-header";

type NewScaffoldPageProps = {
  params: Promise<{ companyId: string; projectId: string }>;
};

/**
 * Register a scaffold — canonical project-scoped route. `projectId` comes
 * from the URL itself now (the caller navigated here FROM a specific
 * project), so there is no separate "choose a project" step the way the
 * old flat /scaffolds/new route needed one.
 */
export default async function NewScaffoldPage({ params }: NewScaffoldPageProps) {
  const { companyId, projectId } = await params;

  const { user } = await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const project = await getProject(companyId, projectId);
  if (!project) {
    notFound();
  }

  const roleNames = await getUserRoleNames(companyId);
  const creatableProjects = await listScaffoldRegisterCreatableProjects(companyId, user.id, roleNames);
  if (!creatableProjects.some((candidate) => candidate.id === project.id)) {
    forbidden();
  }

  const isBroadCreator = isScaffoldBroadCreator(roleNames, true);
  const isEligibleForeman = isBroadCreator ? false : await isCallerEligibleScaffoldForeman(companyId, project.id);
  const selfLocked = mustSelfLockResponsibleForeman(roleNames, true, isEligibleForeman);

  const [foremanOptions, selfLockedForemanId, effectiveInterval] = await Promise.all([
    listEligibleScaffoldForemen(companyId, project.id),
    selfLocked ? getMyEmployeeId(companyId, user.id) : Promise.resolve(null),
    getEffectiveInspectionIntervalForProject(project.id),
  ]);

  // Task 3 Part 15 — scaffold erection date defaults to the project's own local "today," not the server's.
  const today = getProjectLocalDate(project.timezone);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Register scaffold" description={`For ${project.name}.`} />
      <div className="max-w-3xl">
        <ScaffoldForm
          mode="create"
          companyId={companyId}
          projectId={project.id}
          projectName={project.name}
          projectClientName={project.client_name}
          siteLatitude={project.site_latitude}
          siteLongitude={project.site_longitude}
          foremanOptions={foremanOptions}
          selfLockedForemanId={selfLockedForemanId}
          today={today}
          effectiveIntervalType={effectiveInterval.intervalType}
          effectiveIntervalDays={effectiveInterval.intervalDays}
        />
      </div>
    </div>
  );
}
