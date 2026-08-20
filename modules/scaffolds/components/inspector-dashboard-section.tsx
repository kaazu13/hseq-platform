import Link from "next/link";
import { getTranslations, getFormatter } from "next-intl/server";
import { ClipboardCheck, Map, Clock, Wrench } from "lucide-react";
import { listRecentInspections, getScaffoldInspectionOverview } from "@/modules/scaffolds/queries";
import { resolveInspectionHealth, type InspectionHealthState } from "@/modules/scaffolds/inspection-health";
import { getProjectLocalDate } from "@/lib/project-date";
import { SCAFFOLD_INSPECTION_OUTCOME_LABELS } from "@/modules/scaffolds/types";
import { SectionHeader } from "@/components/shared/section-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const CHIP_STATES: InspectionHealthState[] = ["awaiting_initial", "expired", "due_today", "expiring_tomorrow", "valid"];

/**
 * Part 23 — the Inspector's OWN dashboard content: their latest 5
 * finalized inspections and a compact subset of the Inspection Dashboard
 * (reusing resolveInspectionHealth() — never a second status rule). This
 * is deliberately NOT the full Inspection Dashboard (no chart, no
 * priority list) — just enough for "what do I need to inspect right now,"
 * with a CTA into the real one. Rendered instead of the generic company-
 * wide "Current company / Overview" block for Inspector-only accounts
 * (dashboard/page.tsx checks isEmployeeOrInspectorOnlyAccount()).
 */
export async function InspectorDashboardSection({ companyId, projectId, projectTimezone, inspectorEmployeeId, basePath }: { companyId: string; projectId: string; projectTimezone: string | null; inspectorEmployeeId: string; basePath: string }) {
  const [t, tDash, format] = await Promise.all([getTranslations("InspectorDashboard"), getTranslations("InspectionDashboard"), getFormatter()]);
  const [recentInspections, overviewRows] = await Promise.all([listRecentInspections(companyId, projectId, 5, inspectorEmployeeId), getScaffoldInspectionOverview(projectId)]);

  const today = getProjectLocalDate(projectTimezone);
  const counts: Record<InspectionHealthState, number> = { awaiting_initial: 0, expired: 0, due_today: 0, expiring_tomorrow: 0, valid: 0, dismantled: 0 };
  for (const row of overviewRows) {
    if (row.status === "closed") continue;
    counts[resolveInspectionHealth(row.status, row.latestExpiresAt, today)]++;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <SectionHeader title={t("latestInspectionsTitle")} />
        {recentInspections.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title={t("noInspectionsTitle")} description={t("noInspectionsDescription")} />
        ) : (
          <div className="flex flex-col gap-2">
            {recentInspections.map((inspection) => (
              <Link key={inspection.id} href={`${basePath}/scaffolds/${inspection.scaffold_id}/inspections/${inspection.id}`}>
                <Card className="transition-shadow hover:shadow-sm">
                  <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">
                        {inspection.scaffold.tag_number} · {inspection.scaffold.work_area}
                      </span>
                      <span className="text-xs text-muted-foreground">{inspection.finalized_at ? format.dateTime(new Date(inspection.finalized_at), { dateStyle: "medium", timeStyle: "short" }) : "—"}</span>
                    </div>
                    <Badge variant="secondary">{inspection.outcome ? SCAFFOLD_INSPECTION_OUTCOME_LABELS[inspection.outcome] : "—"}</Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeader title={t("inspectionOverviewTitle")} actions={<Link href={`${basePath}/scaffold-inspection-dashboard`} className="text-sm font-medium text-primary hover:underline">{t("openFullDashboard")} →</Link>} />
        <div className="flex flex-wrap gap-2">
          {CHIP_STATES.map((state) => (
            <Link
              key={state}
              href={`${basePath}/scaffolds?health=${state}`}
              className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {tDash(`state.${state}`)}
              <Badge variant="secondary" className="h-4 min-w-4 px-1">
                {counts[state]}
              </Badge>
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeader title={t("quickActionsTitle")} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`${basePath}/scaffold-map`} />}>
            <Map />
            {t("scaffoldMap")}
          </Button>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/my-hours" />}>
            <Clock />
            {t("myHours")}
          </Button>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/my-equipment" />}>
            <Wrench />
            {t("myEquipment")}
          </Button>
        </div>
      </div>
    </div>
  );
}
