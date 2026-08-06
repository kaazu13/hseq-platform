import Link from "next/link";
import { UserCog } from "lucide-react";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getAccountOverview } from "@/modules/account/queries";
import { MEMBERSHIP_STATUS_LABELS } from "@/modules/account/types";
import { PROJECT_ASSIGNMENT_ROLE_LABELS } from "@/modules/projects/types";
import { EMPLOYMENT_STATUS_LABELS } from "@/modules/employees/types";
import { canManageEmployees } from "@/modules/employees/permissions";
import { ProfileEditForm } from "@/modules/account/components/profile-edit-form";
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

  if (!currentCompanyId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="Account" />
        <EmptyState icon={UserCog} title="You're not part of an company yet" description="Once an administrator adds your account to one, your account details will appear here." className="flex-1" />
      </div>
    );
  }

  const [overview, roleNames] = await Promise.all([getAccountOverview(currentCompanyId, user.id), getUserRoleNames(currentCompanyId)]);

  if (!overview) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="Account" />
        <EmptyState icon={UserCog} title="Account details unavailable" description="Your membership in this company couldn't be loaded. Try reloading the page." className="flex-1" />
      </div>
    );
  }

  const displayName = overview.profile.fullName.trim() || user.email || "Unnamed account";
  const initials = initialsFor(overview.profile.fullName, user.email ?? "");
  const canAdminister = canManageEmployees(roleNames);

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6">
      <PageHeader title="Account" description="Your profile, company, roles, and project assignments." />

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
                <dt className="text-xs text-muted-foreground">Company</dt>
                <dd className="text-sm font-medium">{overview.company.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Account status</dt>
                <dd className="text-sm font-medium">{MEMBERSHIP_STATUS_LABELS[overview.membership.status]}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Active roles</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {overview.roles.length === 0 ? <span className="text-sm text-muted-foreground">No roles assigned</span> : overview.roles.map((role) => <Badge key={role.membershipRoleId} variant="secondary">{role.label}</Badge>)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Last sign-in</dt>
                <dd className="text-sm font-medium">{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : "Not available"}</dd>
              </div>
            </dl>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <SectionHeader title="Employment record" />
        {overview.employee ? (
          <Card>
            <CardContent className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Employee number</dt>
                <dd className="text-sm font-medium">{overview.employee.employeeNumber}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Position</dt>
                <dd className="text-sm font-medium">{overview.employee.positionTitle ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Employment status</dt>
                <dd className="text-sm font-medium">{EMPLOYMENT_STATUS_LABELS[overview.employee.employmentStatus as keyof typeof EMPLOYMENT_STATUS_LABELS] ?? overview.employee.employmentStatus}</dd>
              </div>
            </CardContent>
          </Card>
        ) : (
          <EmptyState icon={UserCog} title="No linked employee record" description="This account isn't linked to a company employment record yet — project assignments require one. An administrator can link one from Company Members." />
        )}
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeader title="Assigned projects" />
        {overview.projectAssignments.length === 0 ? (
          <EmptyState icon={UserCog} title="No project assignments" description="You haven't been assigned to any project yet." />
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
        <SectionHeader title="Edit profile" description="Full name and phone are the only fields you can change here — role and company are managed by an administrator." />
        <ProfileEditForm fullName={overview.profile.fullName} phone={overview.profile.phone} />
      </div>

      {canAdminister && (
        <div className="flex flex-col gap-3">
          <SectionHeader title="Company administration" />
          <Link href="/admin/members" className="text-sm font-medium text-primary underline-offset-2 hover:underline">
            Manage company members →
          </Link>
        </div>
      )}
    </div>
  );
}
