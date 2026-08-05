import { forbidden, notFound } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentOrganization } from "@/modules/organizations/queries";
import { getProject } from "@/modules/projects/queries";
import { getInspection, getScaffold, isCallerProjectAccessible, listScaffoldCandidateEmployees } from "@/modules/scaffolds/queries";
import { canManageScaffold } from "@/modules/scaffolds/permissions";
import { SCAFFOLD_INSPECTION_REASON_LABELS } from "@/modules/scaffolds/types";
import { ScaffoldInspectionStatusBadge } from "@/modules/scaffolds/components/scaffold-inspection-status-badge";
import { ScaffoldInspectionOutcomeBadge } from "@/modules/scaffolds/components/scaffold-inspection-outcome-badge";
import { InspectionChecklist } from "@/modules/scaffolds/components/inspection-checklist";
import { InspectionCorrectionCard } from "@/modules/scaffolds/components/inspection-correction-card";
import { ScaffoldPrintButton } from "@/modules/scaffolds/components/scaffold-print-button";
import { listDefectsForInspection } from "@/modules/scaffold-defects/queries";
import { canManageScaffoldDefectDetails } from "@/modules/scaffold-defects/permissions";
import { ScaffoldDefectsSection } from "@/modules/scaffold-defects/components/scaffold-defects-section";
import { toEmployeeOptions } from "@/components/shared/employee-combobox";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { Card, CardContent } from "@/components/ui/card";

type InspectionDetailPageProps = {
  params: Promise<{ scaffoldId: string; inspectionId: string }>;
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Inspection detail — the printable scaffold inspection report
 * (`print:hidden` on anything interactive, same convention as every
 * other detail page this session). Finalized inspections are immutable
 * here; a manage-tier user can start a correction (a new linked
 * inspection, never an in-place edit — see
 * modules/scaffolds/components/inspection-correction-card.tsx).
 */
export default async function InspectionDetailPage({ params }: InspectionDetailPageProps) {
  const { scaffoldId, inspectionId } = await params;
  const { user } = await requireUser();
  const { currentOrganizationId } = await resolveCurrentOrganization(user.id);

  if (!currentOrganizationId) {
    forbidden();
  }

  const inspection = await getInspection(currentOrganizationId, inspectionId);
  if (!inspection || inspection.scaffold_id !== scaffoldId) {
    notFound();
  }

  const [roleNames, hasProjectAccess, scaffold, project, defects] = await Promise.all([
    getUserRoleNames(currentOrganizationId),
    isCallerProjectAccessible(inspection.project_id),
    getScaffold(currentOrganizationId, scaffoldId),
    getProject(currentOrganizationId, inspection.project_id),
    listDefectsForInspection(currentOrganizationId, inspectionId),
  ]);

  if (!scaffold) {
    notFound();
  }

  const projectName = project?.name ?? "Project unavailable";
  const canManage = canManageScaffold(roleNames, hasProjectAccess);
  const canManageDefects = canManageScaffoldDefectDetails(roleNames, hasProjectAccess);
  const candidates = toEmployeeOptions(await listScaffoldCandidateEmployees(currentOrganizationId, inspection.project_id));

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6 print:p-0">
      <PageHeader
        title={`${scaffold.tag_number} — inspection`}
        description={`${projectName} · ${scaffold.work_area} · ${SCAFFOLD_INSPECTION_REASON_LABELS[inspection.inspection_reason]}`}
        actions={<ScaffoldPrintButton />}
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <ScaffoldInspectionStatusBadge status={inspection.status} />
        {inspection.outcome && <ScaffoldInspectionOutcomeBadge outcome={inspection.outcome} />}
        <span className="text-sm text-muted-foreground">{formatDateTime(inspection.inspected_at)}</span>
      </div>

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
        <InspectionChecklist organizationId={currentOrganizationId} inspectionId={inspection.id} scaffoldId={scaffoldId} projectId={inspection.project_id} items={inspection.items} candidates={candidates} readOnly />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeader title="Defects" />
        <ScaffoldDefectsSection
          organizationId={currentOrganizationId}
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
          <InspectionCorrectionCard organizationId={currentOrganizationId} scaffoldId={scaffoldId} projectId={inspection.project_id} inspectionId={inspection.id} />
        </div>
      )}
    </div>
  );
}
