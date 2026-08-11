import { NextResponse } from "next/server";
import { getPublicReport } from "@/modules/reports/queries";
import { isDocumentPassthroughRecordType, type PublicDocumentReport, type PublicLmraReport, type PublicScaffoldInspectionReport, type PublicSafetyObservationReport, type PublicCorrectiveActionReport } from "@/modules/reports/types";
import { renderPdfResponse } from "@/modules/reports/pdf/render";
import { formatLmraReference } from "@/modules/lmra/types";
import { LmraPdfDocument } from "@/modules/lmra/pdf/lmra-pdf-document";
import { formatInspectionReference } from "@/modules/scaffolds/types";
import { ScaffoldInspectionPdfDocument } from "@/modules/scaffolds/pdf/scaffold-inspection-pdf-document";
import { formatObservationReference } from "@/modules/observations/types";
import { ObservationPdfDocument } from "@/modules/observations/pdf/observation-pdf-document";
import { formatCorrectiveActionReference } from "@/modules/corrective-actions/types";
import { CorrectiveActionPdfDocument } from "@/modules/corrective-actions/pdf/corrective-action-pdf-document";
import { createPublicClient } from "@/lib/supabase/public";
import { createToolboxDocumentSignedUrl } from "@/lib/storage/toolbox-documents";

type RouteContext = { params: Promise<{ token: string }> };

/**
 * Public, unauthenticated PDF/download for a shared report — re-resolves
 * the token independently (never trusts anything about the page render
 * that may have preceded this request). Reuses the SAME four PDF document
 * components the internal "Download PDF" routes use, fed directly from the
 * public JSONB payload (no adapter needed — resolve_public_report() already
 * returns the exact PublicXxxReport shape). Toolbox Meeting/Safety Flash
 * are document-passthrough: there is no PDF to generate, so this redirects
 * to a freshly minted signed URL for the one already-uploaded file the
 * share covers, scoped by the has_valid_toolbox_document_share() storage
 * RLS policy.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const { token } = await params;
  const payload = await getPublicReport(token);
  if (!payload) {
    return NextResponse.json({ error: "This link is unavailable." }, { status: 404 });
  }

  const { record_type } = payload.share;
  const companyName = payload.company?.name ?? "Company";
  const projectName = payload.project?.name ?? "Project unavailable";

  if (isDocumentPassthroughRecordType(record_type)) {
    const record = payload.record as PublicDocumentReport;
    const supabase = createPublicClient();
    const signedUrl = await createToolboxDocumentSignedUrl(supabase, record.storage_object_path);
    if (!signedUrl) {
      return NextResponse.json({ error: "This document is unavailable." }, { status: 404 });
    }
    return NextResponse.redirect(signedUrl);
  }

  if (record_type === "lmra") {
    const record = payload.record as PublicLmraReport;
    const reference = formatLmraReference(record);
    const document = <LmraPdfDocument companyName={companyName} projectName={projectName} reference={reference} record={record} />;
    return renderPdfResponse(document, `${reference} - ${record.work_activity}`);
  }

  if (record_type === "scaffold_inspection") {
    const record = payload.record as PublicScaffoldInspectionReport;
    const reference = formatInspectionReference({ scaffold_number: record.scaffold_number }, { sequence_number: record.sequence_number });
    const document = <ScaffoldInspectionPdfDocument companyName={companyName} projectName={projectName} record={record} />;
    return renderPdfResponse(document, reference);
  }

  if (record_type === "safety_observation") {
    const record = payload.record as PublicSafetyObservationReport;
    const reference = formatObservationReference(record);
    const document = <ObservationPdfDocument companyName={companyName} projectName={projectName} reference={reference} record={record} />;
    return renderPdfResponse(document, `${reference} - ${record.work_area}`);
  }

  if (record_type === "corrective_action") {
    const record = payload.record as PublicCorrectiveActionReport;
    const reference = formatCorrectiveActionReference(record);
    const document = <CorrectiveActionPdfDocument companyName={companyName} projectName={projectName} reference={reference} record={record} />;
    return renderPdfResponse(document, `${reference} - ${record.description.slice(0, 40)}`);
  }

  return NextResponse.json({ error: "Unsupported report type." }, { status: 500 });
}
