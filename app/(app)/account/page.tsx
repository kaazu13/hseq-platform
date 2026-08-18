import Link from "next/link";
import { UserCog } from "lucide-react";
import { getTranslations, getFormatter } from "next-intl/server";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { resolveCurrentProject } from "@/modules/projects/queries";
import { getAccountOverview } from "@/modules/account/queries";
import { primaryRole } from "@/modules/account/types";
import { canManageEmployees } from "@/modules/employees/permissions";
import { PersonalInformationCard } from "@/modules/account/components/personal-information-card";
import { AccountHeaderCard } from "@/modules/account/components/account-header-card";
import { WorkInformationCard } from "@/modules/account/components/work-information-card";
import { PreferencesSummaryCard } from "@/modules/account/components/preferences-summary-card";
import { ChangePasswordDialog } from "@/modules/account-security/components/change-password-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_LOCALE, isSupportedLocale, LOCALE_NATIVE_NAMES } from "@/i18n/locale";

function initialsFor(name: string, email: string) {
  const source = name.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/**
 * The Account page — Account/Profile UX redesign. Compact cards with clear
 * hierarchy (header identity, Personal Information, Work Information,
 * Account & Security, Preferences) instead of one long uncontrolled form.
 * Desktop: two balanced columns inside a max-width container. Mobile:
 * single column, no horizontal scroll. Role/status labels come from the
 * AccountLabels i18n namespace (stable DB codes -> localized display
 * text), never raw enum values. Only phone/birth date are editable here —
 * full_name, role, company, and status stay read-only (RLS is the real
 * enforcement; see getAccountOverview/updateOwnProfile).
 */
export default async function AccountPage() {
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);
  const [t, tLabels, format] = await Promise.all([getTranslations("Account"), getTranslations("AccountLabels"), getFormatter()]);

  if (!currentCompanyId) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title={t("title")} />
        <EmptyState icon={UserCog} title={t("noCompanyTitle")} description={t("noCompanyDescription")} className="flex-1" />
      </div>
    );
  }

  const [overview, roleNames, { projects, currentProjectId }, supabase] = await Promise.all([
    getAccountOverview(currentCompanyId, user.id),
    getUserRoleNames(currentCompanyId),
    resolveCurrentProject(user.id, currentCompanyId),
    createClient(),
  ]);

  if (!overview) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title={t("title")} />
        <EmptyState icon={UserCog} title={t("unavailableTitle")} description={t("unavailableDescription")} className="flex-1" />
      </div>
    );
  }

  const { data: profileRow } = await supabase.from("profiles").select("locale").eq("id", user.id).maybeSingle();
  const currentLocale = profileRow && isSupportedLocale(profileRow.locale) ? profileRow.locale : DEFAULT_LOCALE;

  const displayName = overview.profile.fullName.trim() || user.email || t("unnamedAccount");
  const initials = initialsFor(overview.profile.fullName, user.email ?? "");
  const canAdminister = canManageEmployees(roleNames);

  const leadRole = primaryRole(overview.roles);
  const roleAtCompanyLine = leadRole ? t("roleAtCompany", { role: tLabels(`roles.${leadRole.name}`), company: overview.company.name }) : null;

  const currentProject = currentProjectId ? projects.find((project) => project.id === currentProjectId) : undefined;
  const currentProjectLine = currentProject ? t("currentProject", { project: currentProject.name }) : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title={t("title")} description={t("description")} />

      <AccountHeaderCard
        initials={initials}
        displayName={displayName}
        email={user.email ?? ""}
        roleAtCompanyLine={roleAtCompanyLine}
        currentProjectLine={currentProjectLine}
        statusLabel={tLabels(`membershipStatus.${overview.membership.status}`)}
        statusAriaLabel={t("accountStatus")}
        lastSignInLabel={t("lastSignIn")}
        lastSignInValue={user.last_sign_in_at ? format.dateTime(new Date(user.last_sign_in_at), { dateStyle: "medium", timeStyle: "short" }) : t("notAvailable")}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <PersonalInformationCard
            companyId={currentCompanyId}
            fullName={overview.profile.fullName}
            phone={overview.profile.phone}
            birthDate={overview.employee?.birthDate ?? null}
            hasEmployeeRecord={Boolean(overview.employee)}
          />

          <WorkInformationCard
            title={t("workInformation")}
            employee={
              overview.employee
                ? {
                    employeeNumberLabel: t("employeeNumber"),
                    employeeNumber: overview.employee.employeeNumber,
                    positionLabel: t("position"),
                    position: overview.employee.positionTitle ?? "—",
                    employmentStatusLabel: t("employmentStatus"),
                    employmentStatus: tLabels(`employmentStatus.${overview.employee.employmentStatus}` as "employmentStatus.active"),
                    startDateLabel: t("startDate"),
                    startDate: overview.employee.startDate ? format.dateTime(new Date(overview.employee.startDate), { dateStyle: "long" }) : null,
                  }
                : null
            }
            noEmployeeRecordTitle={t("noEmployeeRecordTitle")}
            noEmployeeRecordDescription={t("noEmployeeRecordDescription")}
            rolesLabel={t("roles")}
            roles={overview.roles.map((role) => tLabels(`roles.${role.name}`))}
            noRolesAssigned={t("noRolesAssigned")}
            assignedProjectsLabel={t("assignedProjects")}
            projects={overview.projectAssignments.map((assignment) => ({
              id: assignment.projectId,
              name: assignment.projectName,
              roleLabel: tLabels(`projectRole.${assignment.assignmentRole}`),
            }))}
            noProjectAssignments={t("noProjectAssignments")}
          />
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("accountSecurity")}</CardTitle>
              <CardDescription>{t("accountSecurityDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t("email")}</p>
                  <p className="text-sm font-medium">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t("password")}</p>
                  <p className="text-sm font-medium tracking-widest">••••••••</p>
                </div>
                <ChangePasswordDialog />
              </div>
            </CardContent>
          </Card>

          <PreferencesSummaryCard languageName={LOCALE_NATIVE_NAMES[currentLocale]} />

          {canAdminister && (
            <div className="flex flex-col gap-3">
              <SectionHeader title={t("companyAdministration")} />
              <Link href="/admin/members" className="text-sm font-medium text-primary underline-offset-2 hover:underline">
                {t("manageCompanyMembers")} →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
