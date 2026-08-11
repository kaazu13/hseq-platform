import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getProject } from "@/modules/projects/queries";
import { getObservation } from "@/modules/observations/queries";
import { formatObservationReference } from "@/modules/observations/types";
import { listCorrectiveActionsForObservation } from "@/modules/corrective-actions/queries";
import { ObservationPdfDocument, toPublicObservationReport } from "@/modules/observations/pdf/observation-pdf-document";
import { renderPdfResponse } from "@/modules/reports/pdf/render";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ observationId: string }> };

/**
 * Internal, authenticated "Download PDF" for one Safety Observation.
 * Gated by the same view reach as the detail page — safety_observations_select
 * RLS already scopes getObservation(); no separate "can download PDF"
 * tier. Never trusts client-supplied content.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const { observationId } = await params;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);
  if (!currentCompanyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const observation = await getObservation(currentCompanyId, observationId);
  if (!observation || observation.company_id !== currentCompanyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [project, correctiveActions, supabase] = await Promise.all([
    getProject(currentCompanyId, observation.project_id),
    listCorrectiveActionsForObservation(currentCompanyId, observationId),
    createClient(),
  ]);
  const { data: company } = await supabase.from("companies").select("name").eq("id", currentCompanyId).maybeSingle();

  const reference = formatObservationReference(observation);
  const document = (
    <ObservationPdfDocument
      companyName={company?.name ?? "Company"}
      projectName={project?.name ?? "Project unavailable"}
      reference={reference}
      record={toPublicObservationReport(
        observation,
        correctiveActions.map((action) => ({
          description: action.description,
          status: action.status,
          priority: action.priority,
          due_date: action.due_date,
        })),
      )}
    />
  );

  return renderPdfResponse(document, `${reference} - ${observation.work_area}`);
}
