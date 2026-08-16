import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  FileBadge,
  FolderKanban,
  ListChecks,
  Plus,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { requireUser, getUserRoleNames, isEmployeeOnlyAccount } from "@/lib/auth/session";
import {
  countActiveMembers,
  getCurrentUserProfile,
  resolveCurrentCompany,
} from "@/modules/companies/queries";
import { resolveCurrentProject, getProject } from "@/modules/projects/queries";
import { createClient } from "@/lib/supabase/server";
import { canAdministerCompany } from "@/modules/admin/permissions";
import { canManageEmployees } from "@/modules/employees/permissions";
import { isCurrentUserPlatformSuperAdmin } from "@/modules/platform-admin/queries";
import { getOnboardingChecklist } from "@/modules/onboarding/queries";
import { isOnboardingCoreComplete } from "@/modules/onboarding/types";
import { OnboardingBanner } from "@/modules/onboarding/components/onboarding-banner";
import { getMyEmployeeId, getEmployeeTodayCard } from "@/modules/daily-workforce/queries";
import { getLatestWorkedHours, listMyWorkedHoursDiscrepancies, listWorkedHoursForPeriod } from "@/modules/worked-hours/queries";
import { resolveWorkedHoursPeriod, countDaysWorked } from "@/modules/worked-hours/period";
import { listMyObservations } from "@/modules/observations/queries";
import { listMyLmraAssessmentsForDate } from "@/modules/lmra/queries";
import { listToolboxMeetings } from "@/modules/toolbox-meetings/queries";
import { listActiveSafetyFlashesForEmployee } from "@/modules/safety-flash/queries";
import { listMyCorrectiveActions } from "@/modules/corrective-actions/queries";
import { listEquipmentCandidateItems } from "@/modules/equipment/queries";
import { EmployeeDashboardSection } from "@/modules/daily-workforce/components/employee-dashboard-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusIndicator, type StatusTone } from "@/components/shared/status-indicator";
import { ProjectSelectorCard } from "@/modules/projects/components/project-selector-card";

const COMPANY_STATUS_TONE: Record<string, StatusTone> = {
  trial: "info",
  active: "success",
  suspended: "danger",
};

/**
 * Company-aware dashboard — see docs/IMPLEMENTATION_PLAN.md M7.5.
 *
 * Exactly one thing on this page is a real KPI (Team Members, from
 * `countActiveMembers`); everything else is a `StatCard`/`EmptyState` in
 * its "not yet available" form, per the milestone's explicit instruction
 * not to present fabricated numbers as real data. The zero-membership
 * case is its own distinct branch, not a degraded version of the normal
 * one.
 */
export default async function DashboardPage() {
  const { user } = await requireUser();
  const [{ companies, currentCompanyId }, profile, isPlatformSuperAdmin] = await Promise.all([
    resolveCurrentCompany(user.id),
    getCurrentUserProfile(user.id),
    isCurrentUserPlatformSuperAdmin(),
  ]);

  const displayName = profile?.full_name?.trim() || user.email?.split("@")[0] || "there";

  if (companies.length === 0) {
    // Item 19 — a safe state, no platform data exposed. A platform super
    // admin with zero memberships (e.g. right after being granted access,
    // before creating or joining any company) gets a real next step;
    // anyone else is told to wait for an administrator, honestly — this
    // platform has no self-serve company creation for non-admins.
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title={`Welcome, ${displayName}`} description="Let's get you into a company." />
        <EmptyState
          icon={Users}
          title="No active company membership found"
          description={
            isPlatformSuperAdmin
              ? "You're not a member of any company yet. As a platform administrator, you can create one from Platform Admin."
              : "Once a company administrator adds your account to a company, it will appear here automatically — no action needed on your end."
          }
          className="flex-1"
        />
        {isPlatformSuperAdmin && (
          <Button size="sm" nativeButton={false} render={<Link href="/platform-admin/companies/new" />} className="w-fit">
            <Plus />
            Create Company
          </Button>
        )}
      </div>
    );
  }

  const current = companies.find((company) => company.id === currentCompanyId) ?? companies[0];
  const [memberCount, roleNames] = await Promise.all([countActiveMembers(current.id), getUserRoleNames(current.id)]);
  const companyTone = COMPANY_STATUS_TONE[current.status] ?? "neutral";

  // Item 26 — the banner disappears once onboarding's core is done, so it
  // never nags a company that no longer needs it; only company management
  // ever sees it at all (an employee's dashboard is never cluttered with
  // company-setup guidance that isn't theirs to act on).
  const canSeeOnboarding = canAdministerCompany(roleNames);
  const onboardingChecklist = canSeeOnboarding ? await getOnboardingChecklist(current.id) : null;
  const showOnboardingBanner = onboardingChecklist !== null && !isOnboardingCoreComplete(onboardingChecklist);

  // Post-login/post-company-switch project resolution: exactly one
  // accessible project auto-selects (persisted directly here — idempotent,
  // RLS-protected via profiles_update_own — so every other project-scoped
  // page reads a real active_project_id on its very next load, not just
  // this render); more than one, with none currently active, prompts an
  // explicit choice instead of guessing.
  const { projects, currentProjectId } = await resolveCurrentProject(user.id, current.id);
  let effectiveProjectId = currentProjectId;
  if (!currentProjectId && projects.length === 1) {
    const supabase = await createClient();
    await supabase.from("profiles").update({ active_project_id: projects[0].id }).eq("id", user.id);
    effectiveProjectId = projects[0].id;
  } else if (!currentProjectId && projects.length > 1) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title={`Welcome back, ${displayName}`} description={`Choose which ${current.name} project to work in.`} />
        <ProjectSelectorCard companyId={current.id} projects={projects} />
      </div>
    );
  } else if (!currentProjectId && projects.length === 0 && !canSeeOnboarding) {
    // Item 18 — valid company membership, but no accessible project at
    // all. Never crashes, never guesses, never shows unrelated company
    // data — a safe, explicit state with the right next step for a
    // non-manager (management gets the onboarding banner below instead,
    // which already covers "create/assign a project").
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title={`Welcome back, ${displayName}`} description={current.name} />
        <EmptyState icon={FolderKanban} title="You are not currently assigned to a project" description="Contact your company administrator to be added to a project." className="flex-1" />
      </div>
    );
  }

  // Employee-role correction: a plain employee (no other role) gets a
  // purely personal dashboard — no company-wide aggregates (member count,
  // company-wide certificate/corrective-action stats, "recent activity"),
  // no management quick actions. Every other role's dashboard is
  // completely unchanged.
  const isPlainEmployee = isEmployeeOnlyAccount(roleNames);
  const currentProject = effectiveProjectId ? await getProject(current.id, effectiveProjectId) : null;

  // Employee Dashboard section (Phase F) — only when the signed-in user
  // has a linked employee record for this company AND an active project;
  // every query below is explicitly scoped to that one employee, never
  // exposing another employee's records.
  let employeeSection: ReactNode = null;
  if (effectiveProjectId) {
    const myEmployeeId = await getMyEmployeeId(current.id, user.id);
    if (myEmployeeId) {
      const today = new Date().toISOString().slice(0, 10);
      const weekPeriod = resolveWorkedHoursPeriod("week", today);
      const monthPeriod = resolveWorkedHoursPeriod("month", today);
      const [todayCard, weekRows, monthToDateRows, latestWorkedHours, discrepancies, observations, todaysLmra, todaysToolboxMeetings, activeSafetyFlashes, myCorrectiveActions, equipmentCandidateItems] =
        await Promise.all([
          getEmployeeTodayCard(current.id, effectiveProjectId, myEmployeeId, today),
          listWorkedHoursForPeriod(current.id, effectiveProjectId, weekPeriod.fromDate, weekPeriod.toDate, [myEmployeeId]),
          listWorkedHoursForPeriod(current.id, effectiveProjectId, monthPeriod.fromDate, today, [myEmployeeId]),
          getLatestWorkedHours(current.id, effectiveProjectId, myEmployeeId),
          listMyWorkedHoursDiscrepancies(current.id, myEmployeeId),
          listMyObservations(current.id, user.id, myEmployeeId),
          listMyLmraAssessmentsForDate(current.id, myEmployeeId, today),
          listToolboxMeetings(current.id, { projectId: effectiveProjectId, dateFrom: today, dateTo: today }),
          listActiveSafetyFlashesForEmployee(current.id, effectiveProjectId),
          listMyCorrectiveActions(current.id, myEmployeeId),
          listEquipmentCandidateItems(current.id, effectiveProjectId),
        ]);

      const hoursThisWeek = weekRows[0]?.totalHours ?? 0;
      const monthToDateHours = monthToDateRows[0]?.totalHours ?? 0;
      const daysWorkedThisMonth = monthToDateRows[0] ? countDaysWorked(monthToDateRows[0].hoursByDate) : 0;

      employeeSection = (
        <EmployeeDashboardSection
          companyId={current.id}
          projectId={effectiveProjectId}
          myEmployeeId={myEmployeeId}
          todayCard={todayCard}
          hoursThisWeek={hoursThisWeek}
          monthToDateHours={monthToDateHours}
          daysWorkedThisMonth={daysWorkedThisMonth}
          latestWorkedHours={latestWorkedHours}
          discrepancies={discrepancies}
          observations={observations}
          todaysLmra={todaysLmra}
          todaysToolboxMeetings={todaysToolboxMeetings}
          activeSafetyFlashes={activeSafetyFlashes}
          myCorrectiveActions={myCorrectiveActions}
          equipmentCandidateItems={equipmentCandidateItems}
        />
      );
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6">
      <PageHeader
        title={`Welcome back, ${displayName}`}
        description={isPlainEmployee && currentProject ? `${current.name} · Current project: ${currentProject.name}` : `Here's what's happening at ${current.name}.`}
        actions={
          isPlainEmployee ? undefined : (
            <>
              {canManageEmployees(roleNames) && (
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/employees" />}>
                  <UserPlus />
                  Add employee
                </Button>
              )}
              <Button size="sm" nativeButton={false} render={<Link href="/incidents" />}>
                <Plus />
                Report incident
              </Button>
            </>
          )
        }
      />

      {showOnboardingBanner && onboardingChecklist && <OnboardingBanner checklist={onboardingChecklist} />}

      {employeeSection}

      {!isPlainEmployee && (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Current company
                </span>
                <span className="text-lg font-semibold">{current.name}</span>
              </div>
              <StatusIndicator tone={companyTone} label={current.status} className="capitalize" />
            </CardContent>
          </Card>

          <div>
            <SectionHeader title="Overview" className="mb-3" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                variant="live"
                label="Team members"
                icon={Users}
                value={memberCount}
                href="/settings"
              />
              <StatCard variant="placeholder" label="Active projects" icon={FolderKanban} href="/projects" />
              <StatCard
                variant="placeholder"
                label="Certificates expiring soon"
                icon={FileBadge}
                href="/certificates"
              />
              <StatCard
                variant="placeholder"
                label="Open corrective actions"
                icon={ListChecks}
                href="/corrective-actions"
              />
            </div>
          </div>

          <div>
            <SectionHeader title="Activity & compliance" className="mb-3" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <Activity className="size-4 text-muted-foreground" />
                    Recent activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <EmptyState
                    icon={Activity}
                    title="No activity yet"
                    description="Actions taken across your company will show up here once business modules are in place."
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <ShieldCheck className="size-4 text-muted-foreground" />
                    Compliance overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <EmptyState
                    icon={ShieldCheck}
                    title="Not yet available"
                    description="A summary of inspections, LMRA completion, and open safety items will appear here."
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <FileBadge className="size-4 text-muted-foreground" />
                    Expiring certificates
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <EmptyState
                    icon={FileBadge}
                    title="Not yet available"
                    description="Employee certificates approaching their expiry date will be listed here."
                    action={
                      <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/certificates" />}>
                        View certificates
                      </Button>
                    }
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <AlertTriangle className="size-4 text-muted-foreground" />
                    Open corrective actions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <EmptyState
                    icon={AlertTriangle}
                    title="Not yet available"
                    description="Remediation tasks raised from inspections and incidents will be tracked here."
                    action={
                      <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/corrective-actions" />}>
                        View corrective actions
                      </Button>
                    }
                  />
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <FolderKanban className="size-4 text-muted-foreground" />
                    Project overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <EmptyState
                    icon={FolderKanban}
                    title="Not yet available"
                    description="Active projects, their locations, and current status will be summarized here."
                    action={
                      <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/projects" />}>
                        View projects
                      </Button>
                    }
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
