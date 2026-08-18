import Link from "next/link";
import { notFound, forbidden } from "next/navigation";
import { getTranslations, getFormatter } from "next-intl/server";
import { ClipboardCheck } from "lucide-react";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames, isEmployeeOnlyAccount } from "@/lib/auth/session";
import { getProject } from "@/modules/projects/queries";
import { listInspectionsForProject, type ScaffoldInspectionListFilters } from "@/modules/scaffolds/queries";
import { SCAFFOLD_INSPECTION_REASON_LABELS, formatInspectionReference } from "@/modules/scaffolds/types";
import { ScaffoldInspectionStatusBadge } from "@/modules/scaffolds/components/scaffold-inspection-status-badge";
import { ScaffoldInspectionOutcomeBadge } from "@/modules/scaffolds/components/scaffold-inspection-outcome-badge";
import { ScaffoldInspectionFilters } from "@/modules/scaffolds/components/scaffold-inspection-filters";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { RefreshButton } from "@/components/shared/refresh-button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type ScaffoldInspectionsPageProps = {
  params: Promise<{ companyId: string; projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

function formatDateTime(value: string, format: Awaited<ReturnType<typeof getFormatter>>): string {
  return format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Scaffold Inspections — the project-wide inspection list (Planning &
 * Daily nav). Every row links to the SAME canonical inspection-detail
 * route a scaffold's own history list links to
 * (modules/scaffolds/components/inspection-history-list.tsx) — one
 * inspection view, reached from two entry points, never duplicated.
 *
 * Authorization hardening: same URL-vs-row cross-check as every other
 * canonical route in this tree — `getProject` returning null (a real
 * project belonging to a different company) 404s before any inspection
 * data is fetched.
 */
export default async function ScaffoldInspectionsPage({ params, searchParams }: ScaffoldInspectionsPageProps) {
  const { companyId, projectId } = await params;
  const urlParams = await searchParams;

  await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const project = await getProject(companyId, projectId);
  if (!project) {
    notFound();
  }

  // Employee-role correction: kept worker-focused — ordinary Employee
  // does not perform or manage Scaffold Inspections. Also closes a real
  // RLS gap (scaffold_inspections_select previously admitted any project
  // member) — see the accompanying migration.
  const roleNames = await getUserRoleNames(companyId);
  if (isEmployeeOnlyAccount(roleNames)) {
    forbidden();
  }

  const filters: ScaffoldInspectionListFilters = { status: urlParams.status };
  const inspections = await listInspectionsForProject(companyId, projectId, filters);
  const basePath = `/companies/${companyId}/projects/${projectId}/scaffold-inspections`;
  const scaffoldsBasePath = `/companies/${companyId}/projects/${projectId}/scaffolds`;
  const [t, format] = await Promise.all([getTranslations("ScaffoldInspections"), getFormatter()]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title={t("title")} description={t("description", { project: project.name })} actions={<RefreshButton />} />

      <ScaffoldInspectionFilters basePath={basePath} />

      {inspections.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title={t("noInspectionsTitle")} description={t("noInspectionsDescription")} className="flex-1" />
      ) : (
        <div className="flex flex-col gap-3">
          {inspections.map((inspection) => (
            <Link
              key={inspection.id}
              href={`${scaffoldsBasePath}/${inspection.scaffold.id}/inspections/${inspection.id}`}
              className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex flex-col gap-2 pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-sm font-medium">{formatInspectionReference(inspection.scaffold, inspection)}</span>
                    <div className="flex items-center gap-2">
                      <ScaffoldInspectionStatusBadge status={inspection.status} />
                      {inspection.voided_at && <Badge variant="destructive">{t("voided")}</Badge>}
                      {inspection.outcome && <ScaffoldInspectionOutcomeBadge outcome={inspection.outcome} />}
                    </div>
                  </div>
                  <p className="text-sm">
                    {inspection.scaffold.tag_number} · {inspection.scaffold.work_area}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {SCAFFOLD_INSPECTION_REASON_LABELS[inspection.inspection_reason]} · {formatDateTime(inspection.inspected_at, format)}
                  </p>
                  {inspection.superseded_by_id && <p className="text-xs text-muted-foreground">{t("supersededByCorrection")}</p>}
                  {inspection.corrects_inspection_id && <p className="text-xs text-muted-foreground">{t("correctsEarlier")}</p>}
                  {inspection.voided_at && <p className="text-xs text-muted-foreground">{t("voidedReason", { reason: inspection.void_reason ?? "" })}</p>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
