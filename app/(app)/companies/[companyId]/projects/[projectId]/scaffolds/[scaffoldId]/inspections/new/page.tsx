import { forbidden, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames, isPlatformSuperAdmin } from "@/lib/auth/session";
import { getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { getScaffold, isCallerProjectAccessible, listEligibleScaffoldInspectors, listInspectionsForScaffold } from "@/modules/scaffolds/queries";
import { canManageScaffoldInspection, mustSelfLockInspector } from "@/modules/scaffolds/permissions";
import { InspectionForm } from "@/modules/scaffolds/components/inspection-form";
import { PageHeader } from "@/components/shared/page-header";
import { createClient } from "@/lib/supabase/server";

type NewInspectionPageProps = {
  params: Promise<{ companyId: string; projectId: string; scaffoldId: string }>;
};

/**
 * Authorization hardening: same URL-vs-row project cross-check as the
 * scaffold detail page. Parts 7-9: the Inspector field's self-lock vs.
 * free-pick behavior is resolved HERE (server-side) from the caller's
 * real role/project-assignment state — never inferred client-side. The
 * real enforcement is still the DB trigger (assert_valid_inspection_inspector,
 * see 20260901125000_scaffold_participants_and_inspector_lock.sql); this
 * only decides what to render.
 */
export default async function NewInspectionPage({ params }: NewInspectionPageProps) {
  const { companyId, projectId, scaffoldId } = await params;
  const { user } = await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const scaffold = await getScaffold(companyId, scaffoldId);
  if (!scaffold || scaffold.project_id !== projectId) {
    notFound();
  }

  const [roleNames, hasProjectAccess, myProjectAssignmentRoles, isSuperAdmin] = await Promise.all([
    getUserRoleNames(companyId),
    isCallerProjectAccessible(scaffold.project_id),
    getMyProjectAssignmentRoles(companyId, scaffold.project_id, user.id),
    isPlatformSuperAdmin(),
  ]);
  if (!isSuperAdmin && !canManageScaffoldInspection(roleNames, hasProjectAccess, myProjectAssignmentRoles)) {
    forbidden();
  }
  // A closed/dismantled scaffold is retired — validate_scaffold_inspection_insert()
  // is the authoritative guard (also exempts corrections, which have no UI
  // entry point here anyway), this just avoids rendering a form whose
  // submit would always fail.
  if (scaffold.status === "closed") {
    forbidden();
  }

  const mustSelfLock = !isSuperAdmin && mustSelfLockInspector(roleNames, hasProjectAccess, myProjectAssignmentRoles);

  const supabase = await createClient();
  const [{ data: selfEmployee }, eligibleAlternates, priorInspections, t] = await Promise.all([
    supabase.from("employees").select("id, first_name, last_name").eq("company_id", companyId).eq("profile_id", user.id).maybeSingle(),
    mustSelfLock ? Promise.resolve([]) : listEligibleScaffoldInspectors(companyId, scaffold.project_id),
    listInspectionsForScaffold(companyId, scaffoldId),
    getTranslations("ScaffoldInspection"),
  ]);
  const selfName = selfEmployee ? `${selfEmployee.first_name} ${selfEmployee.last_name}` : null;

  if (mustSelfLock && !selfEmployee) {
    // An Inspector/Foreman-tier caller with no linked employee record
    // literally cannot be "themselves" — this shouldn't happen in
    // practice (the role itself implies an employee record), but fail
    // closed rather than render a broken locked field with nothing to lock to.
    forbidden();
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title={t("newInspectionTitle")} description={`${scaffold.tag_number} · ${scaffold.work_area}`} />
      <div className="max-w-3xl">
        <InspectionForm
          companyId={companyId}
          scaffoldId={scaffold.id}
          projectId={scaffold.project_id}
          mustSelfLock={mustSelfLock}
          selfName={selfName}
          selfEmployeeId={selfEmployee?.id ?? null}
          eligibleAlternates={eligibleAlternates}
          priorInspections={priorInspections}
        />
      </div>
    </div>
  );
}
