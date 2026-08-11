import { View, Text } from "@react-pdf/renderer";
import {
  ReportPdfDocument,
  PdfSection,
  PdfField,
  PdfFieldGrid,
  PdfBadge,
  PdfEmptyState,
  formatPdfDate,
  formatPdfDateTime,
  formatPdfPersonName,
  formatPdfEnumLabel,
  styles,
} from "@/modules/reports/pdf/primitives";
import type { PublicLmraReport } from "@/modules/reports/types";
import { LMRA_SHIFT_LABELS, LMRA_STATUS_LABELS, LMRA_RESULT_LABELS, LMRA_HAZARD_TYPE_LABELS, type LmraShift, type LmraStatus, type LmraResult, type LmraHazardType, type LmraAssessmentDetail } from "@/modules/lmra/types";

/**
 * Adapts the internal, authenticated LmraAssessmentDetail (modules/lmra/queries.ts's
 * getLmraAssessment) into the SAME PublicLmraReport shape
 * resolve_public_report() returns for the anonymous share path — this is
 * what lets one PDF document component serve both the internal "Download
 * PDF" route and the public share route without divergence.
 */
export function toPublicLmraReport(assessment: LmraAssessmentDetail): PublicLmraReport {
  return {
    id: assessment.id,
    work_area: assessment.work_area,
    work_activity: assessment.work_activity,
    work_date: assessment.work_date,
    shift: assessment.shift,
    status: assessment.status,
    result: assessment.result,
    stop_work_reason: assessment.stop_work_reason,
    notes: assessment.notes,
    created_at: assessment.created_at,
    updated_at: assessment.updated_at,
    submitted_at: assessment.submitted_at,
    reviewed_at: assessment.reviewed_at,
    completed_by: assessment.completedBy ? { first_name: assessment.completedBy.first_name, last_name: assessment.completedBy.last_name } : null,
    responsible_person: assessment.responsiblePerson ? { first_name: assessment.responsiblePerson.first_name, last_name: assessment.responsiblePerson.last_name } : null,
    participants: assessment.participants.map((p) => ({ first_name: p.employee.first_name, last_name: p.employee.last_name })),
    hazards: assessment.hazards.map((h) => ({
      hazard_type: h.hazard_type,
      is_applicable: h.is_applicable,
      selected_controls: h.selected_controls,
      controls: h.controls,
      controls_confirmed: h.controls_confirmed,
      other_description: h.other_description,
      responsible_person: h.responsiblePerson ? { first_name: h.responsiblePerson.first_name, last_name: h.responsiblePerson.last_name } : null,
    })),
  };
}

export type LmraPdfData = {
  companyName: string;
  projectName: string;
  reference: string;
  record: PublicLmraReport;
};

function shiftLabel(shift: string): string {
  return LMRA_SHIFT_LABELS[shift as LmraShift] ?? formatPdfEnumLabel(shift);
}
function statusLabel(status: string): string {
  return LMRA_STATUS_LABELS[status as LmraStatus] ?? formatPdfEnumLabel(status);
}
function resultLabel(result: string): string {
  return LMRA_RESULT_LABELS[result as LmraResult] ?? formatPdfEnumLabel(result);
}
function hazardLabel(hazardType: string): string {
  return LMRA_HAZARD_TYPE_LABELS[hazardType as LmraHazardType] ?? formatPdfEnumLabel(hazardType);
}

/**
 * LMRA PDF — every field this milestone's Phase 2 explicitly lists:
 * reference, project, date, shift, work area/activity, completed by,
 * responsible person, workers involved, hazards identified (selected/
 * common controls, custom controls, hazard-level responsible persons,
 * controls verification), notes/status. Used by BOTH the internal
 * authenticated download route and the public share route — same
 * component, two callers, per the shared "report data" architecture
 * (modules/reports/types.ts's PublicLmraReport is the one shape both
 * paths produce).
 */
export function LmraPdfDocument({ companyName, projectName, reference, record }: LmraPdfData) {
  const applicableHazards = record.hazards.filter((h) => h.is_applicable);

  return (
    <ReportPdfDocument companyName={companyName} projectName={projectName} reportTitle="Last Minute Risk Assessment" reportReference={reference}>
      <PdfSection title="Overview">
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
          <PdfBadge label={statusLabel(record.status)} tone={record.status === "approved" ? "success" : record.status === "rejected" ? "danger" : "neutral"} />
          {record.status !== "draft" && <PdfBadge label={resultLabel(record.result)} tone={record.result === "go" ? "success" : "danger"} />}
        </View>
        <PdfFieldGrid>
          <PdfField label="Work area" value={record.work_area} />
          <PdfField label="Work activity" value={record.work_activity} />
          <PdfField label="Date" value={formatPdfDate(record.work_date)} />
          <PdfField label="Shift" value={shiftLabel(record.shift)} />
          <PdfField label="LMRA completed by" value={formatPdfPersonName(record.completed_by)} />
          <PdfField label="Person responsible for the work" value={record.responsible_person ? formatPdfPersonName(record.responsible_person) : "Not set"} />
        </PdfFieldGrid>
        {record.result === "no_go" && record.stop_work_reason && <PdfField label="Stop-work reason" value={record.stop_work_reason} full />}
        {record.notes && <PdfField label="Notes" value={record.notes} full />}
      </PdfSection>

      <PdfSection title={`Workers Involved (${record.participants.length})`}>
        {record.participants.length === 0 ? (
          <PdfEmptyState text="No workers recorded." />
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

      <PdfSection title="Hazards Identified & Control Measures">
        {applicableHazards.length === 0 ? (
          <PdfEmptyState text="No hazards were marked applicable." />
        ) : (
          applicableHazards.map((hazard, index) => (
            <View key={index} style={{ marginBottom: 10, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 3, padding: 8 }} wrap={false}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ fontSize: 9.5, fontWeight: 700 }}>{hazardLabel(hazard.hazard_type)}</Text>
                <PdfBadge label={hazard.controls_confirmed ? "Controls verified" : "Not verified"} tone={hazard.controls_confirmed ? "success" : "warning"} />
              </View>
              {hazard.hazard_type === "other" && hazard.other_description && <Text style={{ fontSize: 8.5, marginBottom: 3 }}>Description: {hazard.other_description}</Text>}
              {hazard.selected_controls.length > 0 && (
                <View style={{ marginBottom: 3 }}>
                  <Text style={styles.fieldLabel}>Common controls</Text>
                  {hazard.selected_controls.map((control, controlIndex) => (
                    <Text key={controlIndex} style={{ fontSize: 8.5 }}>
                      • {control}
                    </Text>
                  ))}
                </View>
              )}
              {hazard.controls && (
                <View style={{ marginBottom: 3 }}>
                  <Text style={styles.fieldLabel}>Additional control measure</Text>
                  <Text style={{ fontSize: 8.5 }}>{hazard.controls}</Text>
                </View>
              )}
              {hazard.responsible_person && (
                <Text style={{ fontSize: 8, color: "#4b5563" }}>Responsible person: {formatPdfPersonName(hazard.responsible_person)}</Text>
              )}
            </View>
          ))
        )}
      </PdfSection>

      <PdfSection title="Record History">
        <PdfFieldGrid>
          <PdfField label="Created" value={formatPdfDateTime(record.created_at)} />
          <PdfField label="Submitted" value={formatPdfDateTime(record.submitted_at)} />
          <PdfField label="Reviewed" value={formatPdfDateTime(record.reviewed_at)} />
          <PdfField label="Last updated" value={formatPdfDateTime(record.updated_at)} />
        </PdfFieldGrid>
      </PdfSection>
    </ReportPdfDocument>
  );
}
