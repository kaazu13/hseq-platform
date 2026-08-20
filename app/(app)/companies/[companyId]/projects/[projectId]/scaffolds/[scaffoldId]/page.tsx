import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getFormatter } from "next-intl/server";
import { Pencil, Plus } from "lucide-react";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames, isPlatformSuperAdmin } from "@/lib/auth/session";
import { getProject, getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { getScaffold, listInspectionsForScaffold, isCallerProjectAccessible, getCurrentInspectionExpiryByScaffold, canManageScaffoldPhotos } from "@/modules/scaffolds/queries";
import { canManageScaffold, canManageScaffoldInspection } from "@/modules/scaffolds/permissions";
import { resolveInspectionHealth } from "@/modules/scaffolds/inspection-health";
import { SCAFFOLD_TYPE_LABELS, formatScaffoldDimensions } from "@/modules/scaffolds/types";
import { getProjectLocalDate } from "@/lib/project-date";
import { ScaffoldStatusBadge } from "@/modules/scaffolds/components/scaffold-status-badge";
import { ScaffoldLocationCard } from "@/modules/scaffolds/components/scaffold-location-card";
import { ScaffoldParticipantsList } from "@/modules/scaffolds/components/scaffold-participants-list";
import { InspectionHistoryList } from "@/modules/scaffolds/components/inspection-history-list";
import { ScaffoldPhotoGallery } from "@/modules/scaffolds/components/scaffold-photo-gallery";
import { ScaffoldPrintButton } from "@/modules/scaffolds/components/scaffold-print-button";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HardHat } from "lucide-react";

type ScaffoldDetailPageProps = {
  params: Promise<{ companyId: string; projectId: string; scaffoldId: string }>;
};

function formatDate(value: string | null, format: Awaited<ReturnType<typeof getFormatter>>): string {
  if (!value) return "—";
  return format.dateTime(new Date(`${value}T00:00:00Z`), { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Scaffold detail — the register entry plus its complete chronological
 * inspection history (this milestone's explicit requirement — nothing is
 * ever removed from this list, including superseded/corrected
 * inspections). This same page is the printable scaffold handover/status
 * certificate (`print:hidden` on anything interactive, same convention as
 * every other detail page this session).
 *
 * Authorization hardening beyond RLS: `getScaffold()` already scopes by
 * `companyId`, but a scaffold that's real and company-accessible could
 * still belong to a DIFFERENT project than the one named in this URL — RLS
 * only answers "is this accessible at all," never "does it match this
 * specific URL." The explicit `scaffold.project_id !== projectId` check
 * below is what catches that substitution and 404s instead of silently
 * rendering the wrong project's scaffold under this URL.
 */
export default async function ScaffoldDetailPage({ params }: ScaffoldDetailPageProps) {
  const { companyId, projectId, scaffoldId } = await params;
  const { user } = await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const project = await getProject(companyId, projectId);
  if (!project) {
    notFound();
  }

  const scaffold = await getScaffold(companyId, scaffoldId);
  if (!scaffold || scaffold.project_id !== projectId) {
    notFound();
  }

  const [roleNames, hasProjectAccess, myProjectAssignmentRoles, isSuperAdmin, inspections, canManagePhotos] = await Promise.all([
    getUserRoleNames(companyId),
    isCallerProjectAccessible(scaffold.project_id),
    getMyProjectAssignmentRoles(companyId, scaffold.project_id, user.id),
    isPlatformSuperAdmin(),
    listInspectionsForScaffold(companyId, scaffoldId),
    canManageScaffoldPhotos(scaffoldId),
  ]);

  const projectName = project.name;
  // Part 1/14: editing scaffold location follows the SAME "existing
  // scaffold edit permissions" as everything else on this page (Edit
  // button, photos, etc.) — canManageScaffold, unchanged, never a new
  // location-specific permission. An ordinary Employee never reaches this
  // page at all (scaffolds_select RLS already excludes plain employees).
  const canManage = canManageScaffold(roleNames, hasProjectAccess);
  // Part 8/11: "New inspection" uses the WIDER inspection-creation tier
  // (company_admin/project's own PM/platform_super_admin, in addition to
  // canManage's own hseq_manager/hse_officer/inspector).
  const canInspect = isSuperAdmin || canManageScaffoldInspection(roleNames, hasProjectAccess, myProjectAssignmentRoles);
  const expiryByScaffold = await getCurrentInspectionExpiryByScaffold(companyId, [scaffoldId]);
  const basePath = `/companies/${companyId}/projects/${projectId}/scaffolds/${scaffold.id}`;
  const [t, tDash, tCrew, format] = await Promise.all([
    getTranslations("ScaffoldDetail"),
    getTranslations("InspectionDashboard"),
    getTranslations("ScaffoldCrew"),
    getFormatter(),
  ]);
  const todayDate = getProjectLocalDate(project.timezone);
  const healthState = resolveInspectionHealth(scaffold.status, expiryByScaffold.get(scaffoldId) ?? null, todayDate);

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6 print:p-0">
      <PageHeader
        title={scaffold.tag_number}
        description={t("descriptionLine", { number: scaffold.scaffold_number, project: projectName, workArea: scaffold.work_area })}
        actions={
          <>
            {canManage && (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`${basePath}/edit`} />} className="print:hidden">
                <Pencil />
                {t("edit")}
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

      <ScaffoldLocationCard
        scaffoldId={scaffold.id}
        scaffoldNumber={scaffold.scaffold_number}
        workArea={scaffold.work_area}
        latitude={scaffold.latitude}
        longitude={scaffold.longitude}
        healthState={healthState}
        healthLabel={tDash(`state.${healthState}`)}
        projectName={projectName}
        mapHref={`/companies/${companyId}/projects/${projectId}/scaffold-map`}
        editHref={`${basePath}/edit`}
        canEdit={canManage}
      />

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("fieldProject")}</p>
            <p className="text-sm">{projectName}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("fieldClient")}</p>
            <p className="text-sm">{scaffold.client_name ?? t("clientNotSet")}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("fieldWorkArea")}</p>
            <p className="text-sm">{scaffold.work_area}</p>
          </div>
          {scaffold.structure_reference && (
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("fieldStructureReference")}</p>
              <p className="text-sm">{scaffold.structure_reference}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("fieldIntendedUse")}</p>
            <p className="text-sm">{scaffold.intended_use}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("fieldMaxLoad")}</p>
            <p className="text-sm">{scaffold.max_load_class}</p>
          </div>
          {formatScaffoldDimensions(scaffold) && (
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("fieldDimensions")}</p>
              <p className="text-sm">{formatScaffoldDimensions(scaffold)}</p>
            </div>
          )}
          {scaffold.erected_by && (
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("fieldErectedBy")}</p>
              <p className="text-sm">{scaffold.erected_by}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("fieldResponsibleForeman")}</p>
            <p className="text-sm">{scaffold.responsibleForeman ? `${scaffold.responsibleForeman.first_name} ${scaffold.responsibleForeman.last_name}` : "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("fieldErectionDate")}</p>
            <p className="text-sm">{formatDate(scaffold.erected_at, format)}</p>
          </div>
          {scaffold.notes && (
            <div className="sm:col-span-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("fieldNotes")}</p>
              <p className="text-sm">{scaffold.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <SectionHeader title={`${tCrew("title")}${scaffold.participants.length > 0 ? ` — ${scaffold.participants.length}` : ""}`} description={tCrew("description")} />
        {scaffold.participants.length === 0 ? (
          <EmptyState icon={HardHat} title={tCrew("crewEmpty")} />
        ) : (
          <ScaffoldParticipantsList participants={scaffold.participants} manualLabel={tCrew("manualBadge")} fromTeamLabel={(name) => tCrew("fromTeam", { name })} />
        )}
        {/* Team links are kept as secondary/audit context (Part 5) — the participant list above is authoritative. */}
        {scaffold.erectionTeams.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {tCrew("importedFromTeams", { teams: scaffold.erectionTeams.map((team) => team.name).join(", ") })}
          </p>
        )}
      </div>

      {scaffold.teamMembers.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionHeader title={t("legacyRosterTitle", { count: scaffold.teamMembers.length })} />
          <p className="text-sm text-muted-foreground">{t("legacyRosterDescription")}</p>
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
        </div>
      )}

      <div className="flex flex-col gap-3 print:hidden">
        <SectionHeader title={`${t("completionPhotosTitle")}${scaffold.photos.length > 0 ? ` — ${scaffold.photos.length}/30` : ""}`} />
        <ScaffoldPhotoGallery
          companyId={companyId}
          projectId={projectId}
          scaffoldId={scaffold.id}
          tagNumber={scaffold.tag_number}
          initialPhotos={scaffold.photos}
          canManage={canManagePhotos}
        />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeader
          title={t("inspectionHistoryTitle")}
          actions={
            canInspect && scaffold.status !== "closed" ? (
              <Button size="sm" nativeButton={false} render={<Link href={`${basePath}/inspections/new`} />} className="print:hidden">
                <Plus />
                {t("newInspection")}
              </Button>
            ) : undefined
          }
        />
        {inspections.length === 0 ? (
          <EmptyState icon={HardHat} title={t("noInspectionsTitle")} description={t("noInspectionsDescription")} />
        ) : (
          <InspectionHistoryList basePath={basePath} scaffoldNumber={scaffold.scaffold_number} inspections={inspections} />
        )}
      </div>
    </div>
  );
}
