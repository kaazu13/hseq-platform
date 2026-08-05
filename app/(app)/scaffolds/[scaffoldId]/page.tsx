import Link from "next/link";
import { notFound, forbidden } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentOrganization } from "@/modules/organizations/queries";
import { getProject } from "@/modules/projects/queries";
import { getScaffold, listInspectionsForScaffold, isCallerProjectAccessible, getCurrentInspectionExpiryByScaffold } from "@/modules/scaffolds/queries";
import { canManageScaffold } from "@/modules/scaffolds/permissions";
import { SCAFFOLD_TYPE_LABELS, formatScaffoldDimensions } from "@/modules/scaffolds/types";
import { ScaffoldStatusBadge } from "@/modules/scaffolds/components/scaffold-status-badge";
import { InspectionHistoryList } from "@/modules/scaffolds/components/inspection-history-list";
import { ScaffoldPrintButton } from "@/modules/scaffolds/components/scaffold-print-button";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HardHat } from "lucide-react";

type ScaffoldDetailPageProps = {
  params: Promise<{ scaffoldId: string }>;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Scaffold detail — the register entry plus its complete chronological
 * inspection history (this milestone's explicit requirement — nothing is
 * ever removed from this list, including superseded/corrected
 * inspections). This same page is the printable scaffold handover/status
 * certificate (`print:hidden` on anything interactive, same convention as
 * every other detail page this session).
 */
export default async function ScaffoldDetailPage({ params }: ScaffoldDetailPageProps) {
  const { scaffoldId } = await params;
  const { user } = await requireUser();
  const { currentOrganizationId } = await resolveCurrentOrganization(user.id);

  if (!currentOrganizationId) {
    forbidden();
  }

  const scaffold = await getScaffold(currentOrganizationId, scaffoldId);
  if (!scaffold) {
    notFound();
  }

  const [roleNames, hasProjectAccess, project, inspections] = await Promise.all([
    getUserRoleNames(currentOrganizationId),
    isCallerProjectAccessible(scaffold.project_id),
    getProject(currentOrganizationId, scaffold.project_id),
    listInspectionsForScaffold(currentOrganizationId, scaffoldId),
  ]);

  const projectName = project?.name ?? "Project unavailable";
  const canManage = canManageScaffold(roleNames, hasProjectAccess);
  const expiryByScaffold = await getCurrentInspectionExpiryByScaffold(currentOrganizationId, [scaffoldId]);

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6 print:p-0">
      <PageHeader
        title={scaffold.tag_number}
        description={`${projectName} · ${scaffold.work_area}`}
        actions={
          <>
            {canManage && (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/scaffolds/${scaffold.id}/edit`} />} className="print:hidden">
                <Pencil />
                Edit
              </Button>
            )}
            <ScaffoldPrintButton />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <ScaffoldStatusBadge status={scaffold.status} currentInspectionExpiresAt={expiryByScaffold.get(scaffoldId) ?? null} />
        <span className="text-sm text-muted-foreground">{SCAFFOLD_TYPE_LABELS[scaffold.scaffold_type]}</span>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Project</p>
            <p className="text-sm">{projectName}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Work area</p>
            <p className="text-sm">{scaffold.work_area}</p>
          </div>
          {scaffold.structure_reference && (
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Structure / equipment reference</p>
              <p className="text-sm">{scaffold.structure_reference}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Intended use</p>
            <p className="text-sm">{scaffold.intended_use}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Maximum permitted load</p>
            <p className="text-sm">{scaffold.max_load_class}</p>
          </div>
          {formatScaffoldDimensions(scaffold) && (
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Dimensions</p>
              <p className="text-sm">{formatScaffoldDimensions(scaffold)}</p>
            </div>
          )}
          {scaffold.erected_by && (
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Erected by</p>
              <p className="text-sm">{scaffold.erected_by}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Responsible foreman</p>
            <p className="text-sm">{scaffold.responsibleForeman ? `${scaffold.responsibleForeman.first_name} ${scaffold.responsibleForeman.last_name}` : "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Erection date</p>
            <p className="text-sm">{formatDate(scaffold.erected_at)}</p>
          </div>
          {scaffold.notes && (
            <div className="sm:col-span-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Notes</p>
              <p className="text-sm">{scaffold.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <SectionHeader title={`Scaffold team${scaffold.teamMembers.length > 0 ? ` — ${scaffold.teamMembers.length} members` : ""}`} />
        {scaffold.teamMembers.length === 0 ? (
          <EmptyState icon={HardHat} title="No scaffold team members recorded" />
        ) : (
          <Card>
            <CardContent className="pt-4">
              <ol className="flex flex-col gap-1.5 text-sm">
                {scaffold.teamMembers.map((member, index) => (
                  <li key={member.id}>
                    {index + 1}. {member.firstName} {member.lastName}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeader
          title="Inspection history"
          actions={
            canManage ? (
              <Button size="sm" nativeButton={false} render={<Link href={`/scaffolds/${scaffold.id}/inspections/new`} />} className="print:hidden">
                <Plus />
                New inspection
              </Button>
            ) : undefined
          }
        />
        {inspections.length === 0 ? (
          <EmptyState icon={HardHat} title="No inspections yet" description="This scaffold has not been inspected yet." />
        ) : (
          <InspectionHistoryList scaffoldId={scaffold.id} inspections={inspections} />
        )}
      </div>
    </div>
  );
}
