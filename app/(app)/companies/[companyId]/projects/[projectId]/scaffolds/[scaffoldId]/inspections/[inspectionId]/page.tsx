import { notFound } from "next/navigation";
import { requireCompanyMembership, requireProjectAccess, requireUser, getUserRoleNames } from "@/lib/auth/session";
import { getProject } from "@/modules/projects/queries";
import { getInspection, getScaffold, isCallerProjectAccessible, listScaffoldCandidateEmployees } from "@/modules/scaffolds/queries";
import { canManageScaffold } from "@/modules/scaffolds/permissions";
import { SCAFFOLD_INSPECTION_REASON_LABELS, formatInspectionReference } from "@/modules/scaffolds/types";
import { ScaffoldInspectionStatusBadge } from "@/modules/scaffolds/components/scaffold-inspection-status-badge";
import { ScaffoldInspectionOutcomeBadge } from "@/modules/scaffolds/components/scaffold-inspection-outcome-badge";
import { InspectionChecklist } from "@/modules/scaffolds/components/inspection-checklist";
import { InspectionCorrectionCard } from "@/modules/scaffolds/components/inspection-correction-card";
import { ScaffoldPrintButton } from "@/modules/scaffolds/components/scaffold-print-button";
import { listDefectsForInspection } from "@/modules/scaffold-defects/queries";
import { canManageScaffoldDefectDetails } from "@/modules/scaffold-defects/permissions";
import { ScaffoldDefectsSection } from "@/modules/scaffold-defects/components/scaffold-defects-section";
import { toEmployeeOptions } from "@/modules/employees/employee-options";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type InspectionDetailPageProps = {
  params: Promise<{ companyId: string; projectId: string; scaffoldId: string; inspectionId: string }>;
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Inspection detail — the ONE canonical inspection view: reached both from
 * a scaffold's own inspection-history list and from the project's Scaffold
 * Inspections list page (modules/scaffolds/components/inspection-history-list.tsx
 * and the new .../scaffold-inspections list both link here — no separate,
 * duplicate inspection page exists anywhere). Also the printable scaffold
 * inspection report (`print:hidden` on anything interactive, same
 * convention as every other detail page this session). Finalized
 * inspections are immutable here; a manage-tier user can start a
 * correction (a new linked inspection, never an in-place edit — see
 * modules/scaffolds/components/inspection-correction-card.tsx).
 *
 * Authorization hardening beyond RLS: `inspection.scaffold_id !==
 * scaffoldId` catches a real inspection requested under the wrong
 * scaffold's URL; `scaffold.project_id !== projectId` catches a real
 * scaffold requested under the wrong project's URL — RLS only answers "is
 * this accessible to me at all," never "does it match THIS URL."
 */
export default async function InspectionDetailPage({ params }: InspectionDetailPageProps) {
  const { companyId, projectId, scaffoldId, inspectionId } = await params;
  const { user } = await requireUser();
  await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const inspection = await getInspection(companyId, inspectionId);
  if (!inspection || inspection.scaffold_id !== scaffoldId || inspection.project_id !== projectId) {
    notFound();
  }

  const [roleNames, hasProjectAccess, scaffold, project, defects] = await Promise.all([
    getUserRoleNames(companyId),
    isCallerProjectAccessible(inspection.project_id),
    getScaffold(companyId, scaffoldId),
    getProject(companyId, inspection.project_id),
    listDefectsForInspection(companyId, inspectionId),
  ]);

  if (!scaffold || scaffold.project_id !== projectId) {
    notFound();
  }

  const projectName = project?.name ?? "Project unavailable";
  const canManage = canManageScaffold(roleNames, hasProjectAccess);
  // A voided inspection is a terminal, frozen record — its defects don't
  // grow or change after the fact either (validate_scaffold_defect_insert/
  // _update() enforce this at the database level regardless; this just
  // keeps the UI from offering a control the write would then reject).
  const canManageDefects = !inspection.voided_at && canManageScaffoldDefectDetails(roleNames, hasProjectAccess);
  const candidates = toEmployeeOptions(await listScaffoldCandidateEmployees(companyId, inspection.project_id));

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6 print:p-0">
      <PageHeader
        title={formatInspectionReference(scaffold, inspection)}
        description={`${scaffold.tag_number} · ${projectName} · ${scaffold.work_area} · ${SCAFFOLD_INSPECTION_REASON_LABELS[inspection.inspection_reason]}`}
        actions={<ScaffoldPrintButton />}
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <ScaffoldInspectionStatusBadge status={inspection.status} />
        {inspection.voided_at && <Badge variant="destructive">Voided</Badge>}
        {inspection.outcome && <ScaffoldInspectionOutcomeBadge outcome={inspection.outcome} />}
        <span className="text-sm text-muted-foreground">{formatDateTime(inspection.inspected_at)}</span>
      </div>

      {inspection.voided_at && (
        <Card className="border-destructive/40">
          <CardContent className="pt-4">
            <p className="text-sm font-medium text-destructive">This draft inspection was voided</p>
            <p className="text-sm text-muted-foreground">{inspection.void_reason}</p>
          </CardContent>
        </Card>
      )}

      {inspection.outcome === "safe_with_restrictions" && inspection.restrictions_notes && (
        <Card className="border-amber-500/40">
          <CardContent className="pt-4">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Restrictions</p>
            <p className="text-sm">{inspection.restrictions_notes}</p>
          </CardContent>
        </Card>
      )}

      {inspection.corrects_inspection_id && (
        <Card className="border-blue-500/40">
          <CardContent className="pt-4">
            <p className="text-sm font-medium text-blue-700 dark:text-blue-400">This inspection corrects an earlier one</p>
            <p className="text-sm text-muted-foreground">{inspection.correction_reason}</p>
          </CardContent>
        </Card>
      )}

      {inspection.superseded_by_id && (
        <Card className="border-muted-foreground/30">
          <CardContent className="pt-4">
            <p className="text-sm font-medium">This inspection has been superseded by a correction</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Inspector</p>
            <p className="text-sm">{inspection.inspector ? `${inspection.inspector.first_name} ${inspection.inspector.last_name}` : "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Created</p>
            <p className="text-sm">{formatDateTime(inspection.created_at)}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Finalized</p>
            <p className="text-sm">{formatDateTime(inspection.finalized_at)}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Valid until</p>
            <p className="text-sm">{formatDateTime(inspection.expires_at)}</p>
          </div>
          {inspection.notes && (
            <div className="sm:col-span-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Notes</p>
              <p className="text-sm">{inspection.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <SectionHeader title="Checklist" />
        <InspectionChecklist companyId={companyId} inspectionId={inspection.id} scaffoldId={scaffoldId} projectId={inspection.project_id} items={inspection.items} candidates={candidates} readOnly />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeader title="Defects" />
        <ScaffoldDefectsSection
          companyId={companyId}
          inspectionId={inspection.id}
          scaffoldId={scaffoldId}
          projectId={inspection.project_id}
          defects={defects}
          candidates={candidates}
          canCreate={canManageDefects}
          canManageDetails={canManageDefects}
          roleNames={roleNames}
          hasProjectAccess={hasProjectAccess}
          currentUserProfileId={user.id}
        />
      </div>

      {canManage && inspection.status === "finalized" && !inspection.superseded_by_id && (
        <div className="print:hidden">
          <InspectionCorrectionCard companyId={companyId} scaffoldId={scaffoldId} projectId={inspection.project_id} inspectionId={inspection.id} />
        </div>
      )}
    </div>
  );
}
