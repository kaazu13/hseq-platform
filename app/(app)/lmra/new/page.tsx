import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { resolveCurrentProject, getProject } from "@/modules/projects/queries";
import { listLmraCandidateEmployees, isCallerProjectForeman, isCallerProjectAccessible, getMyEmployeeId } from "@/modules/lmra/queries";
import { canCreateLmra } from "@/modules/lmra/permissions";
import { initialLmraHazardRows } from "@/modules/lmra/types";
import { LmraForm } from "@/modules/lmra/components/lmra-form";
import { toEmployeeOptions } from "@/modules/employees/employee-options";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * New LMRA — the project is resolved from the caller's ACTIVE project
 * context (Phase 2: "resolved from active project context, not manually
 * cross-project selectable"), the same resolveCurrentProject() every other
 * project-scoped page in this app already uses — no LMRA-specific project
 * picker. If no project is currently active, the fix is to pick one via
 * the existing mechanism (dashboard/sidebar switcher), not a second picker
 * built just for LMRA.
 */
export default async function NewLmraPage() {
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    forbidden();
  }

  const { currentProjectId } = await resolveCurrentProject(user.id, currentCompanyId);

  if (!currentProjectId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="New LMRA" description="A short, structured go/no-go risk check completed before starting work." />
        <EmptyState
          icon={ShieldCheck}
          title="No active project selected"
          description="Choose a project first — LMRA is always created for your currently active project."
          action={
            <Button size="sm" nativeButton={false} render={<Link href="/dashboard" />}>
              Go to dashboard
            </Button>
          }
          className="flex-1"
        />
      </div>
    );
  }

  const project = await getProject(currentCompanyId, currentProjectId);
  if (!project) {
    notFound();
  }

  const [roleNames, isForeman, hasProjectAccess, myEmployeeId, candidateRows] = await Promise.all([
    getUserRoleNames(currentCompanyId),
    isCallerProjectForeman(currentCompanyId, currentProjectId, user.id),
    isCallerProjectAccessible(currentProjectId),
    getMyEmployeeId(currentCompanyId, user.id),
    listLmraCandidateEmployees(currentCompanyId, currentProjectId),
  ]);

  if (!canCreateLmra(roleNames, hasProjectAccess, isForeman)) {
    forbidden();
  }

  const isElevated = roleNames.includes("hseq_manager") || isForeman;
  if (!isElevated && !myEmployeeId) {
    // Eligible for project access but has no linked employee record in
    // this company — there is no valid "completed by" identity to pin,
    // same guard modules/lmra/actions.ts's requireLmraCreateAccess enforces.
    forbidden();
  }
  const candidates = toEmployeeOptions(candidateRows);
  const todayDate = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="New LMRA" description={`For ${project.name}.`} />
      <div className="max-w-3xl">
        <LmraForm
          mode="create"
          companyId={currentCompanyId}
          projectId={project.id}
          projectName={project.name}
          candidates={candidates}
          todayDate={todayDate}
          hazardRows={initialLmraHazardRows()}
          participantIds={[]}
          isElevated={isElevated}
          myEmployeeId={myEmployeeId}
        />
      </div>
    </div>
  );
}
