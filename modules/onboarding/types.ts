/**
 * Onboarding checklist (items 3/26) — computed entirely from existing
 * data (companies/projects/employees/project_assignments/
 * company_invitations), never a separate stored "progress" row. Progress
 * is for USEFUL guidance only, never gamification (item 3's explicit
 * instruction) — there is no score, streak, or completion percentage
 * shown anywhere, only concrete counts and a checkmark/circle per item.
 */
export type OnboardingChecklist = {
  companyName: string;
  hasAdministrator: boolean;
  hasLogo: boolean;
  projectCount: number;
  employeeCount: number;
  projectAssignmentCount: number;
  acceptedInvitationCount: number;
  pendingInvitationCount: number;
};

export type OnboardingChecklistItem = {
  key: string;
  label: string;
  done: boolean;
  detail: string | null;
};

export function buildOnboardingChecklistItems(checklist: OnboardingChecklist): OnboardingChecklistItem[] {
  return [
    { key: "company", label: "Company created", done: true, detail: checklist.companyName },
    { key: "admin", label: "Company administrator assigned", done: checklist.hasAdministrator, detail: null },
    { key: "logo", label: "Upload company logo", done: checklist.hasLogo, detail: null },
    { key: "project", label: "Create first project", done: checklist.projectCount > 0, detail: checklist.projectCount > 0 ? `${checklist.projectCount} project${checklist.projectCount === 1 ? "" : "s"}` : null },
    { key: "employees", label: "Add employees", done: checklist.employeeCount > 0, detail: checklist.employeeCount > 0 ? `${checklist.employeeCount} employee${checklist.employeeCount === 1 ? "" : "s"} added` : null },
    { key: "project-roles", label: "Assign project roles", done: checklist.projectAssignmentCount > 0, detail: null },
    {
      key: "invitations",
      label: "Invite users",
      done: checklist.acceptedInvitationCount > 0 || checklist.pendingInvitationCount > 0,
      detail:
        checklist.acceptedInvitationCount > 0 || checklist.pendingInvitationCount > 0
          ? `${checklist.acceptedInvitationCount} accepted${checklist.pendingInvitationCount > 0 ? `, ${checklist.pendingInvitationCount} pending` : ""}`
          : null,
    },
  ];
}

/** "Sufficiently complete" — the core setup (admin, first project, first employee) is done; logo/invitations remain visible on the full checklist but never gate this. Used to auto-hide the dashboard banner once a company no longer needs the nudge (item 26: never require ALL employees to accept before normal use). */
export function isOnboardingCoreComplete(checklist: OnboardingChecklist): boolean {
  return checklist.hasAdministrator && checklist.projectCount > 0 && checklist.employeeCount > 0;
}
