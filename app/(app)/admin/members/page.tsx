import { forbidden } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Users } from "lucide-react";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { listCompanyMembersOverview } from "@/modules/account/queries";
import { listAllRoles } from "@/modules/employees/queries";
import { assignableRoleNamesFor } from "@/modules/employees/permissions";
import { listProjects } from "@/modules/projects/queries";
import { canAdministerCompany } from "@/modules/admin/permissions";
import { MemberRow } from "@/modules/admin/components/member-row";
import { listInvitationsForCompany } from "@/modules/invitations/queries";
import { InviteMemberDialog } from "@/modules/invitations/components/invite-member-dialog";
import { InvitationsList } from "@/modules/invitations/components/invitations-list";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionHeader } from "@/components/shared/section-header";
import type { RoleName } from "@/modules/companies/types";

/**
 * Minimal company-member administration page — status/role/project
 * assignment in one place, gated by the exact same
 * EMPLOYEE_WRITE_ROLES/membership_roles_insert_managers/
 * company_memberships_update_managers rules the database itself
 * enforces (this page adds no new authorization surface — every action it
 * renders a button for is an existing, independently-RLS-guarded Server
 * Function). See docs/ROLES_AND_PERMISSIONS.md §2 for the underlying
 * role-union/restriction model this page is a UI over, not a replacement
 * for.
 */
export default async function AdminMembersPage() {
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    forbidden();
  }

  const roleNames = await getUserRoleNames(currentCompanyId);
  if (!canAdministerCompany(roleNames)) {
    forbidden();
  }

  const [members, allRoles, projects, invitations] = await Promise.all([
    listCompanyMembersOverview(currentCompanyId),
    listAllRoles(),
    listProjects(currentCompanyId),
    listInvitationsForCompany(currentCompanyId),
  ]);

  const assignableNames = new Set(assignableRoleNamesFor(roleNames, allRoles.map((r) => r.name as RoleName)));
  const assignableRoles = allRoles.filter((r) => assignableNames.has(r.name as RoleName));
  const activeProjects = projects.filter((p) => p.status !== "archived");
  const t = await getTranslations("CompanyMembers");

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={<InviteMemberDialog companyId={currentCompanyId} assignableRoles={assignableRoles} projects={activeProjects} />}
      />

      {members.length === 0 ? (
        <EmptyState icon={Users} title={t("noMembersTitle")} description={t("noMembersDescription")} className="flex-1" />
      ) : (
        <div className="flex flex-col gap-3">
          {members.map((member) => (
            <MemberRow key={member.membershipId} companyId={currentCompanyId} member={member} isSelf={member.userId === user.id} assignableRoles={assignableRoles} projects={activeProjects} />
          ))}
        </div>
      )}

      <div>
        <SectionHeader title={t("invitations")} className="mb-3" />
        <InvitationsList invitations={invitations} />
      </div>
    </div>
  );
}
