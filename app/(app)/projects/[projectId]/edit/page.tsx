import { forbidden, notFound } from "next/navigation";
import { requireUser, getUserRoleNames, isPlatformSuperAdmin } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { canManageProject, canEditProjectLocationSettings, canEditProjectSiteLocation } from "@/modules/projects/permissions";
import { getProject, getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { ProjectForm } from "@/modules/projects/components/project-form";
import { ProjectLocationSettingsForm } from "@/modules/projects/components/project-location-settings-form";
import { ProjectSiteLocationForm } from "@/modules/projects/components/project-site-location-form";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";

type EditProjectPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function EditProjectPage({ params }: EditProjectPageProps) {
  const { projectId } = await params;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    forbidden();
  }

  const project = await getProject(currentCompanyId, projectId);
  if (!project) {
    notFound();
  }

  const [roleNames, myProjectRoles, isSuperAdmin] = await Promise.all([
    getUserRoleNames(currentCompanyId),
    getMyProjectAssignmentRoles(currentCompanyId, projectId, user.id),
    isPlatformSuperAdmin(),
  ]);
  const canManageGeneralFields = canManageProject(roleNames, myProjectRoles);
  const canEditLocationSettings = isSuperAdmin || canEditProjectLocationSettings(roleNames);
  const canEditSiteLocation = isSuperAdmin || canEditProjectSiteLocation(roleNames);

  // This page's overall reach is broader than canManageProject alone —
  // Task 3 Part 13's planner (and, in principle, a platform_super_admin
  // with no company_admin/operations_manager/PM standing) may have NO
  // general-field edit access at all but still needs to reach this page to
  // use their own narrower country/timezone or site-location capability.
  // The general ProjectForm section below is only rendered for someone who
  // actually qualifies for canManageProject — a planner who reaches this
  // page purely for site location never sees it.
  if (!canManageGeneralFields && !canEditLocationSettings && !canEditSiteLocation) {
    forbidden();
  }

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6">
      <PageHeader title={`Edit ${project.name}`} description="Update this project's details." />
      {canManageGeneralFields && (
        <div className="max-w-3xl">
          <ProjectForm mode="edit" companyId={currentCompanyId} project={project} />
        </div>
      )}

      <div className="flex max-w-3xl flex-col gap-3">
        <SectionHeader title="Country & timezone" description="Drives the project-local clock and date logic across LMRA, Today's Teams, and Attendance." />
        <ProjectLocationSettingsForm
          companyId={currentCompanyId}
          projectId={projectId}
          countryCode={project.country_code}
          timezone={project.timezone}
          canEdit={canEditLocationSettings}
        />
      </div>

      <div className="flex max-w-3xl flex-col gap-3">
        <SectionHeader title="Site location" description="Physical site address and GPS coordinates, for the Directions link." />
        <ProjectSiteLocationForm
          companyId={currentCompanyId}
          projectId={projectId}
          siteAddress={project.site_address}
          siteLatitude={project.site_latitude}
          siteLongitude={project.site_longitude}
          canEdit={canEditSiteLocation}
        />
      </div>
    </div>
  );
}
