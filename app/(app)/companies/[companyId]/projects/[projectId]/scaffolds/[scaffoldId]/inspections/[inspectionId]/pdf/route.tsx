import { NextResponse } from "next/server";
import { requireCompanyMembership, requireProjectAccess } from "@/lib/auth/session";
import { getInspection, getScaffold } from "@/modules/scaffolds/queries";
import { listDefectsForInspection } from "@/modules/scaffold-defects/queries";
import { formatInspectionReference } from "@/modules/scaffolds/types";
import { ScaffoldInspectionPdfDocument, toPublicScaffoldInspectionReport } from "@/modules/scaffolds/pdf/scaffold-inspection-pdf-document";
import { renderPdfResponse } from "@/modules/reports/pdf/render";
import { getProject } from "@/modules/projects/queries";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ companyId: string; projectId: string; scaffoldId: string; inspectionId: string }> };

/**
 * Internal, authenticated "Download PDF" for one scaffold inspection —
 * same URL-vs-row cross-checks as the canonical inspection detail page
 * (app/(app)/companies/[companyId]/projects/[projectId]/scaffolds/[scaffoldId]/inspections/[inspectionId]/page.tsx):
 * RLS answers "is this accessible to me at all," this route additionally
 * confirms the resolved inspection/scaffold actually belong to THIS URL's
 * scaffoldId/projectId, catching a real record requested under the wrong
 * URL (IDOR-style substitution).
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const { companyId, projectId, scaffoldId, inspectionId } = await params;
  await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const inspection = await getInspection(companyId, inspectionId);
  if (!inspection || inspection.scaffold_id !== scaffoldId || inspection.project_id !== projectId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [scaffold, project, defects, supabase] = await Promise.all([
    getScaffold(companyId, scaffoldId),
    getProject(companyId, projectId),
    listDefectsForInspection(companyId, inspectionId),
    createClient(),
  ]);
  if (!scaffold || scaffold.project_id !== projectId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: company } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();

  const reference = formatInspectionReference(scaffold, inspection);
  const document = (
    <ScaffoldInspectionPdfDocument
      companyName={company?.name ?? "Company"}
      projectName={project?.name ?? "Project unavailable"}
      record={toPublicScaffoldInspectionReport(scaffold, inspection, defects)}
    />
  );

  return renderPdfResponse(document, `${reference} - ${scaffold.tag_number}`);
}
