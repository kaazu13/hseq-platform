import type { Database } from "@/types/database";
import type { RoleName } from "@/modules/companies/types";
import type { ProjectAssignmentRole } from "@/modules/projects/types";

/**
 * Composed, read-only "who am I, in this company" view for the
 * /account page and (in bulk, for every member) the /admin/members
 * administration page. Deliberately its own module rather than living in
 * modules/companies or modules/employees — this is a COMPOSITION of
 * both (plus project_assignments), not a natural extension of either
 * one's existing scope.
 */

export type MembershipStatus = Database["public"]["Enums"]["membership_status"];

export const MEMBERSHIP_STATUSES: MembershipStatus[] = ["invited", "active", "suspended", "removed"];

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  invited: "Invited",
  active: "Active",
  suspended: "Suspended",
  removed: "Removed",
};

export type AccountRole = { membershipRoleId: string; roleId: string; name: RoleName; label: string };

export type AccountProjectAssignment = {
  projectId: string;
  projectName: string;
  assignmentRole: ProjectAssignmentRole;
  endAt: string | null;
};

export type AccountOverview = {
  profile: {
    id: string;
    fullName: string;
    phone: string | null;
    userNumber: string;
  };
  email: string;
  company: { id: string; name: string; slug: string };
  membership: { id: string; status: MembershipStatus; joinedAt: string | null; invitedAt: string | null };
  roles: AccountRole[];
  employee: AccountEmployeeInfo | null;
  projectAssignments: AccountProjectAssignment[];
  lastSignInAt: string | null;
};

export type AccountEmployeeInfo = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  /** The employee record's work email — NOT necessarily the account's login email. `auth.users.email` is not exposed via PostgREST/RLS to any role other than the user themselves, so there is no sanctioned way to show another member's login email on an admin list — see modules/account/queries.ts's header comment. */
  workEmail: string | null;
  positionTitle: string | null;
  employmentStatus: string;
  archivedAt: string | null;
};
