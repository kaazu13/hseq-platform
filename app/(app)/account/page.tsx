import Link from "next/link";
import { UserCog } from "lucide-react";
import { getTranslations, getFormatter } from "next-intl/server";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getAccountOverview } from "@/modules/account/queries";
import { MEMBERSHIP_STATUS_LABELS } from "@/modules/account/types";
import { PROJECT_ASSIGNMENT_ROLE_LABELS } from "@/modules/projects/types";
import { EMPLOYMENT_STATUS_LABELS } from "@/modules/employees/types";
import { canManageEmployees } from "@/modules/employees/permissions";
import { ProfileEditForm } from "@/modules/account/components/profile-edit-form";
import { BirthDateEditForm } from "@/modules/employees/components/birth-date-edit-form";
import { ChangePasswordForm } from "@/modules/account-security/components/change-password-form";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

function initialsFor(name: string, email: string) {
  const source = name.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/**
 * The real Account page — replaces the account-menu's dead "Account" link
 * (previously pointed at the /settings placeholder). Shows exactly what
 * the signed-in user's account actually looks like: company, active
 * roles, assigned projects, account status — all read directly from the
 * membership/RLS architecture (getAccountOverview), never fabricated or
 * inferred client-side. Only full_name/phone are editable here; role,
 * company, and status are always rendered read-only, with a link to
 * /admin/members for anyone actually authorized to change them.
 */
export default async function AccountPage() {
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);
  const [t, format] = await Promise.all([getTranslations("Account"), getFormatter()]);

  if (!currentCompanyId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title={t("title")} />
        <EmptyState icon={UserCog} title={t("noCompanyTitle")} description={t("noCompanyDescription")} className="flex-1" />
      </div>
    );
  }

  const [overview, roleNames] = await Promise.all([getAccountOverview(currentCompanyId, user.id), getUserRoleNames(currentCompanyId)]);

  if (!overview) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title={t("title")} />
        <EmptyState icon={UserCog} title={t("unavailableTitle")} description={t("unavailableDescription")} className="flex-1" />
      </div>
    );
  }

  const displayName = overview.profile.fullName.trim() || user.email || t("unnamedAccount");
  const initials = initialsFor(overview.profile.fullName, user.email ?? "");
  const canAdminister = canManageEmployees(roleNames);

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6">
      <PageHeader title={t("title")} description={t("description")} />

      <Card>
        <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <Avatar size="lg" className="size-16 shrink-0">
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col gap-4">
            <div>
              <p className="text-lg font-semibold">{displayName}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>

            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">{t("company")}</dt>
                <dd className="text-sm font-medium">{overview.company.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("accountStatus")}</dt>
                <dd className="text-sm font-medium">{MEMBERSHIP_STATUS_LABELS[overview.membership.status]}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("activeRoles")}</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {overview.roles.length === 0 ? <span className="text-sm text-muted-foreground">{t("noRolesAssigned")}</span> : overview.roles.map((role) => <Badge key={role.membershipRoleId} variant="secondary">{role.label}</Badge>)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("lastSignIn")}</dt>
                <dd className="text-sm font-medium">{user.last_sign_in_at ? format.dateTime(new Date(user.last_sign_in_at), { dateStyle: "medium", timeStyle: "short" }) : t("notAvailable")}</dd>
              </div>
            </dl>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <SectionHeader title={t("employmentRecord")} />
        {overview.employee ? (
          <Card>
            <CardContent className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">{t("employeeNumber")}</dt>
                <dd className="text-sm font-medium">{overview.employee.employeeNumber}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("position")}</dt>
                <dd className="text-sm font-medium">{overview.employee.positionTitle ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("employmentStatus")}</dt>
                <dd className="text-sm font-medium">{EMPLOYMENT_STATUS_LABELS[overview.employee.employmentStatus as keyof typeof EMPLOYMENT_STATUS_LABELS] ?? overview.employee.employmentStatus}</dd>
              </div>
            </CardContent>
          </Card>
        ) : (
          <EmptyState icon={UserCog} title={t("noEmployeeRecordTitle")} description={t("noEmployeeRecordDescription")} />
        )}
      </div>

      {overview.employee && (
        <div className="flex flex-col gap-3">
          <SectionHeader title={t("birthDate")} />
          <BirthDateEditForm companyId={currentCompanyId} birthDate={overview.employee.birthDate ?? null} />
        </div>
      )}

      <div className="flex flex-col gap-3">
        <SectionHeader title={t("assignedProjects")} />
        {overview.projectAssignments.length === 0 ? (
          <EmptyState icon={UserCog} title={t("noProjectAssignmentsTitle")} description={t("noProjectAssignmentsDescription")} />
        ) : (
          <div className="flex flex-col gap-2">
            {overview.projectAssignments.map((assignment) => (
              <Card key={`${assignment.projectId}-${assignment.assignmentRole}`}>
                <CardContent className="flex items-center justify-between gap-3">
                  <Link href={`/projects/${assignment.projectId}`} className="text-sm font-medium underline-offset-2 hover:underline">
                    {assignment.projectName}
                  </Link>
                  <Badge variant="outline">{PROJECT_ASSIGNMENT_ROLE_LABELS[assignment.assignmentRole]}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeader title={t("editProfile")} description={t("editProfileDescription")} />
        <ProfileEditForm fullName={overview.profile.fullName} phone={overview.profile.phone} />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeader title={t("accountSecurity")} description={t("accountSecurityDescription")} />
        <ChangePasswordForm />
      </div>

      {canAdminister && (
        <div className="flex flex-col gap-3">
          <SectionHeader title={t("companyAdministration")} />
          <Link href="/admin/members" className="text-sm font-medium text-primary underline-offset-2 hover:underline">
            {t("manageCompanyMembers")} →
          </Link>
        </div>
      )}
    </div>
  );
}
