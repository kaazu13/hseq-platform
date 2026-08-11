import { View, Text } from "@react-pdf/renderer";
import { ReportPdfDocument, PdfSection, PdfField, PdfFieldGrid, PdfBadge, PdfEmptyState, formatPdfDate, formatPdfDateTime, formatPdfPersonName, formatPdfEnumLabel } from "@/modules/reports/pdf/primitives";
import type { PublicSafetyObservationReport } from "@/modules/reports/types";
import {
  OBSERVATION_CATEGORY_LABELS,
  OBSERVATION_RISK_LEVEL_LABELS,
  OBSERVATION_STATUS_LABELS,
  OBSERVATION_TYPE_LABELS,
  OBSERVATION_NEGATIVE_DISPOSITION_LABELS,
  isPositiveObservationCategory,
  type ObservationCategory,
  type ObservationRiskLevel,
  type ObservationStatus,
  type ObservationType,
  type ObservationNegativeDisposition,
  type SafetyObservationDetail,
} from "@/modules/observations/types";
import { CORRECTIVE_ACTION_STATUS_LABELS, CORRECTIVE_ACTION_PRIORITY_LABELS, type CorrectiveActionStatus, type CorrectiveActionPriority } from "@/modules/corrective-actions/types";

export type ObservationPdfData = {
  companyName: string;
  projectName: string;
  reference: string;
  record: PublicSafetyObservationReport;
};

/** Adapts the internal, authenticated SafetyObservationDetail into the SAME shape resolve_public_report() returns — see modules/lmra/pdf/lmra-pdf-document.tsx's toPublicLmraReport() for the identical pattern. Corrective actions are resolved separately by the caller (they're a distinct query) and passed in already in the public shape. */
export function toPublicObservationReport(
  observation: SafetyObservationDetail,
  correctiveActions: { description: string; status: string; priority: string; due_date: string }[],
): PublicSafetyObservationReport {
  return {
    id: observation.id,
    work_area: observation.work_area,
    observed_at: observation.observed_at,
    category: observation.category,
    observation_type: observation.observation_type,
    description: observation.description,
    immediate_action_taken: observation.immediate_action_taken,
    risk_level: observation.risk_level,
    is_stop_work: observation.is_stop_work,
    status: observation.status,
    disposition: observation.disposition,
    observer: observation.observer ? { first_name: observation.observer.first_name, last_name: observation.observer.last_name } : null,
    participants: observation.participants.map((p) => ({ first_name: p.employee.first_name, last_name: p.employee.last_name })),
    corrective_actions: correctiveActions,
  };
}

/**
 * Safety Observation PDF — work area, date, category, observation type
 * (positive/negative/general — distinct from category, never conflated,
 * matching the app's own targeting model), description, immediate action,
 * risk level, stop-work flag, status/disposition, observer, participants,
 * and any linked corrective actions.
 */
export function ObservationPdfDocument({ companyName, projectName, reference, record }: ObservationPdfData) {
  const isPositive = isPositiveObservationCategory(record.category as ObservationCategory) || record.observation_type === "positive";

  return (
    <ReportPdfDocument companyName={companyName} projectName={projectName} reportTitle="Safety Observation" reportReference={reference}>
      <PdfSection title="Overview">
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          <PdfBadge label={OBSERVATION_STATUS_LABELS[record.status as ObservationStatus] ?? formatPdfEnumLabel(record.status)} tone={record.status === "closed" ? "success" : "neutral"} />
          <PdfBadge label={OBSERVATION_TYPE_LABELS[record.observation_type as ObservationType] ?? formatPdfEnumLabel(record.observation_type)} tone={isPositive ? "success" : record.observation_type === "negative" ? "warning" : "neutral"} />
          <PdfBadge label={OBSERVATION_RISK_LEVEL_LABELS[record.risk_level as ObservationRiskLevel] ?? formatPdfEnumLabel(record.risk_level)} tone={record.risk_level === "critical" || record.risk_level === "high" ? "danger" : "neutral"} />
          {record.is_stop_work && <PdfBadge label="Stop work" tone="danger" />}
        </View>
        <PdfFieldGrid>
          <PdfField label="Work area" value={record.work_area} />
          <PdfField label="Observed at" value={formatPdfDateTime(record.observed_at)} />
          <PdfField label="Category" value={OBSERVATION_CATEGORY_LABELS[record.category as ObservationCategory] ?? formatPdfEnumLabel(record.category)} />
          <PdfField label="Observer" value={formatPdfPersonName(record.observer)} />
          {record.disposition && <PdfField label="Disposition" value={OBSERVATION_NEGATIVE_DISPOSITION_LABELS[record.disposition as ObservationNegativeDisposition] ?? formatPdfEnumLabel(record.disposition)} />}
        </PdfFieldGrid>
        <PdfField label="Description" value={record.description} full />
        {record.immediate_action_taken && <PdfField label="Immediate action taken" value={record.immediate_action_taken} full />}
      </PdfSection>

      <PdfSection title={`People Involved (${record.participants.length})`}>
        {record.participants.length === 0 ? (
          <PdfEmptyState text="No individuals recorded." />
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {record.participants.map((participant, index) => (
              <Text key={index} style={{ fontSize: 9, marginRight: 12, marginBottom: 3, width: "45%" }}>
                • {formatPdfPersonName(participant)}
              </Text>
            ))}
          </View>
        )}
      </PdfSection>

      <PdfSection title={`Corrective Actions (${record.corrective_actions.length})`}>
        {record.corrective_actions.length === 0 ? (
          <PdfEmptyState text="No corrective actions raised against this observation." />
        ) : (
          record.corrective_actions.map((action, index) => (
            <View key={index} style={{ marginBottom: 6, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 3, padding: 6 }} wrap={false}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                <PdfBadge label={CORRECTIVE_ACTION_PRIORITY_LABELS[action.priority as CorrectiveActionPriority] ?? formatPdfEnumLabel(action.priority)} tone={action.priority === "critical" || action.priority === "high" ? "danger" : "warning"} />
                <Text style={{ fontSize: 8, color: "#4b5563" }}>
                  Due {formatPdfDate(action.due_date)} · {CORRECTIVE_ACTION_STATUS_LABELS[action.status as CorrectiveActionStatus] ?? formatPdfEnumLabel(action.status)}
                </Text>
              </View>
              <Text style={{ fontSize: 8.5 }}>{action.description}</Text>
            </View>
          ))
        )}
      </PdfSection>
    </ReportPdfDocument>
  );
}
