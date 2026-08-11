import { View } from "@react-pdf/renderer";
import { ReportPdfDocument, PdfSection, PdfField, PdfFieldGrid, PdfBadge, formatPdfDate, formatPdfDateTime, formatPdfPersonName, formatPdfEnumLabel } from "@/modules/reports/pdf/primitives";
import type { PublicCorrectiveActionReport } from "@/modules/reports/types";
import {
  CORRECTIVE_ACTION_STATUS_LABELS,
  CORRECTIVE_ACTION_PRIORITY_LABELS,
  isCorrectiveActionOverdue,
  type CorrectiveActionStatus,
  type CorrectiveActionPriority,
  type CorrectiveActionDetail,
} from "@/modules/corrective-actions/types";

export type CorrectiveActionPdfData = {
  companyName: string;
  projectName: string;
  reference: string;
  record: PublicCorrectiveActionReport;
};

/** Adapts the internal, authenticated CorrectiveActionDetail (plus its parent observation's own summary fields) into the SAME shape resolve_public_report() returns — see modules/lmra/pdf/lmra-pdf-document.tsx's toPublicLmraReport() for the identical pattern. */
export function toPublicCorrectiveActionReport(action: CorrectiveActionDetail, observation: { work_area: string; description: string; observed_at: string }): PublicCorrectiveActionReport {
  return {
    id: action.id,
    description: action.description,
    priority: action.priority,
    due_date: action.due_date,
    status: action.status,
    reviewed_at: action.reviewed_at,
    completion_notes: action.completion_notes,
    closure_evidence: action.closure_evidence,
    created_at: action.created_at,
    responsible_person: action.responsiblePerson ? { first_name: action.responsiblePerson.first_name, last_name: action.responsiblePerson.last_name } : null,
    observation,
  };
}

/** Corrective Action PDF — description, priority, due date, responsible person, status, completion/closure evidence, and a summary of the parent observation it was raised from. */
export function CorrectiveActionPdfDocument({ companyName, projectName, reference, record }: CorrectiveActionPdfData) {
  const overdue = isCorrectiveActionOverdue(record.due_date, record.status as CorrectiveActionStatus);

  return (
    <ReportPdfDocument companyName={companyName} projectName={projectName} reportTitle="Corrective Action" reportReference={reference}>
      <PdfSection title="Overview">
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
          <PdfBadge label={CORRECTIVE_ACTION_STATUS_LABELS[record.status as CorrectiveActionStatus] ?? formatPdfEnumLabel(record.status)} tone={record.status === "closed" ? "success" : "neutral"} />
          {overdue && <PdfBadge label="Overdue" tone="danger" />}
        </View>
        <PdfFieldGrid>
          <PdfField label="Priority" value={CORRECTIVE_ACTION_PRIORITY_LABELS[record.priority as CorrectiveActionPriority] ?? formatPdfEnumLabel(record.priority)} />
          <PdfField label="Due date" value={formatPdfDate(record.due_date)} />
          <PdfField label="Responsible person" value={formatPdfPersonName(record.responsible_person)} />
          <PdfField label="Created" value={formatPdfDateTime(record.created_at)} />
          <PdfField label="Reviewed" value={formatPdfDateTime(record.reviewed_at)} />
        </PdfFieldGrid>
        <PdfField label="Description" value={record.description} full />
        {record.completion_notes && <PdfField label="Completion notes" value={record.completion_notes} full />}
        {record.closure_evidence && <PdfField label="Closure evidence" value={record.closure_evidence} full />}
      </PdfSection>

      <PdfSection title="Raised From">
        <PdfFieldGrid>
          <PdfField label="Work area" value={record.observation.work_area} />
          <PdfField label="Observed at" value={formatPdfDateTime(record.observation.observed_at)} />
        </PdfFieldGrid>
        <PdfField label="Observation description" value={record.observation.description} full />
      </PdfSection>
    </ReportPdfDocument>
  );
}
