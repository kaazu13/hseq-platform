import { forbidden } from "next/navigation";
import { Users } from "lucide-react";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentOrganization } from "@/modules/organizations/queries";
import { listOrganizationMembersOverview } from "@/modules/account/queries";
import { listAllRoles } from "@/modules/employees/queries";
import { assignableRoleNamesFor } from "@/modules/employees/permissions";
import { listProjects } from "@/modules/projects/queries";
import { canAdministerOrganization } from "@/modules/admin/permissions";
import { MemberRow } from "@/modules/admin/components/member-row";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import type { RoleName } from "@/modules/organizations/types";

/**
 * Minimal organization-member administration page — status/role/project
 * assignment in one place, gated by the exact same
 * EMPLOYEE_WRITE_ROLES/membership_roles_insert_managers/
 * organization_memberships_update_managers rules the database itself
 * enforces (this page adds no new authorization surface — every action it
 * renders a button for is an existing, independently-RLS-guarded Server
 * Function). See docs/ROLES_AND_PERMISSIONS.md §2 for the underlying
 * role-union/restriction model this page is a UI over, not a replacement
 * for.
 */
export default async function AdminMembersPage() {
  const { user } = await requireUser();
  const { currentOrganizationId } = await resolveCurrentOrganization(user.id);

  if (!currentOrganizationId) {
    forbidden();
  }

  const roleNames = await getUserRoleNames(currentOrganizationId);
  if (!canAdministerOrganization(roleNames)) {
    forbidden();
  }

  const [members, allRoles, projects] = await Promise.all([listOrganizationMembersOverview(currentOrganizationId), listAllRoles(), listProjects(currentOrganizationId)]);

  const assignableNames = new Set(assignableRoleNamesFor(roleNames, allRoles.map((r) => r.name as RoleName)));
  const assignableRoles = allRoles.filter((r) => assignableNames.has(r.name as RoleName));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Organization Members" description="Status, roles, and project assignments for everyone in this organization." />

      {members.length === 0 ? (
        <EmptyState icon={Users} title="No members found" description="This organization has no memberships yet." className="flex-1" />
      ) : (
        <div className="flex flex-col gap-3">
          {members.map((member) => (
            <MemberRow key={member.membershipId} organizationId={currentOrganizationId} member={member} isSelf={member.userId === user.id} assignableRoles={assignableRoles} projects={projects.filter((p) => p.status !== "archived")} />
          ))}
        </div>
      )}
    </div>
  );
}
