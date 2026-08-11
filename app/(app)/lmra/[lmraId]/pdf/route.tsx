import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getProject } from "@/modules/projects/queries";
import { getLmraAssessment } from "@/modules/lmra/queries";
import { formatLmraReference } from "@/modules/lmra/types";
import { LmraPdfDocument, toPublicLmraReport } from "@/modules/lmra/pdf/lmra-pdf-document";
import { renderPdfResponse } from "@/modules/reports/pdf/render";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ lmraId: string }> };

/**
 * Internal, authenticated "Download PDF" for one LMRA. Gated by the SAME
 * view reach as the detail page itself — lmra_assessments_select RLS
 * already scopes getLmraAssessment(); there is no separate "can download
 * PDF" tier, matching the detail page's own model where anyone who can see
 * the record can also print/export it. Never trusts client-supplied
 * content — every field comes from a server-side, company-scoped read.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const { lmraId } = await params;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);
  if (!currentCompanyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const assessment = await getLmraAssessment(currentCompanyId, lmraId);
  if (!assessment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Defense-in-depth cross-check: getLmraAssessment() already filters by
  // company_id, so this can only fail if that invariant is ever violated —
  // costs nothing and matches this codebase's "never trust a single layer"
  // convention for anything URL-addressable.
  if (assessment.company_id !== currentCompanyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [project, supabase] = await Promise.all([getProject(currentCompanyId, assessment.project_id), createClient()]);
  const { data: company } = await supabase.from("companies").select("name").eq("id", currentCompanyId).maybeSingle();

  const reference = formatLmraReference(assessment);
  const document = (
    <LmraPdfDocument
      companyName={company?.name ?? "Company"}
      projectName={project?.name ?? "Project unavailable"}
      reference={reference}
      record={toPublicLmraReport(assessment)}
    />
  );

  return renderPdfResponse(document, `${reference} - ${assessment.work_activity}`);
}
