import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getProject } from "@/modules/projects/queries";
import { getCorrectiveAction } from "@/modules/corrective-actions/queries";
import { formatCorrectiveActionReference } from "@/modules/corrective-actions/types";
import { getObservation } from "@/modules/observations/queries";
import { CorrectiveActionPdfDocument, toPublicCorrectiveActionReport } from "@/modules/corrective-actions/pdf/corrective-action-pdf-document";
import { renderPdfResponse } from "@/modules/reports/pdf/render";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ actionId: string }> };

/**
 * Internal, authenticated "Download PDF" for one Corrective Action —
 * there is no standalone internal detail PAGE for a corrective action
 * (it's always viewed embedded within its parent observation's page), but
 * the PDF/share feature still needs its own resolvable record — gated by
 * the same view reach corrective_actions_select RLS already provides.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const { actionId } = await params;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);
  if (!currentCompanyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const action = await getCorrectiveAction(currentCompanyId, actionId);
  if (!action || action.company_id !== currentCompanyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const observation = await getObservation(currentCompanyId, action.observation_id);
  if (!observation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [project, supabase] = await Promise.all([getProject(currentCompanyId, action.project_id), createClient()]);
  const { data: company } = await supabase.from("companies").select("name").eq("id", currentCompanyId).maybeSingle();

  const reference = formatCorrectiveActionReference(action);
  const document = (
    <CorrectiveActionPdfDocument
      companyName={company?.name ?? "Company"}
      projectName={project?.name ?? "Project unavailable"}
      reference={reference}
      record={toPublicCorrectiveActionReport(action, { work_area: observation.work_area, description: observation.description, observed_at: observation.observed_at })}
    />
  );

  return renderPdfResponse(document, `${reference} - ${action.description.slice(0, 40)}`);
}
