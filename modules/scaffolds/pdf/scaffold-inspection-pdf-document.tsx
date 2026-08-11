import { View, Text } from "@react-pdf/renderer";
import {
  ReportPdfDocument,
  PdfSection,
  PdfField,
  PdfFieldGrid,
  PdfBadge,
  PdfEmptyState,
  PdfVoidBanner,
  formatPdfDate,
  formatPdfPersonName,
  formatPdfEnumLabel,
} from "@/modules/reports/pdf/primitives";
import type { PublicScaffoldInspectionReport } from "@/modules/reports/types";
import {
  SCAFFOLD_INSPECTION_STATUS_LABELS,
  SCAFFOLD_INSPECTION_OUTCOME_LABELS,
  SCAFFOLD_INSPECTION_REASON_LABELS,
  SCAFFOLD_INSPECTION_ITEM_TYPE_LABELS,
  SCAFFOLD_INSPECTION_ITEM_RESULT_LABELS,
  SCAFFOLD_TYPE_LABELS,
  SCAFFOLD_DEFECT_SEVERITY_LABELS,
  formatInspectionReference,
  type ScaffoldInspectionStatus,
  type ScaffoldInspectionOutcome,
  type ScaffoldInspectionReason,
  type ScaffoldInspectionItemType,
  type ScaffoldInspectionItemResult,
  type ScaffoldType,
  type ScaffoldDefectSeverity,
  type Scaffold,
  type ScaffoldInspectionDetail,
} from "@/modules/scaffolds/types";
import type { ScaffoldDefectDetail } from "@/modules/scaffold-defects/types";

export type ScaffoldInspectionPdfData = {
  companyName: string;
  projectName: string;
  record: PublicScaffoldInspectionReport;
};

/** Adapts the internal scaffold + inspection + defects reads into the same shape resolve_public_report() returns, for the public share path — see modules/lmra/pdf/lmra-pdf-document.tsx's toPublicLmraReport() for the identical pattern. */
export function toPublicScaffoldInspectionReport(scaffold: Pick<Scaffold, "scaffold_number" | "tag_number" | "work_area" | "scaffold_type">, inspection: ScaffoldInspectionDetail, defects: ScaffoldDefectDetail[]): PublicScaffoldInspectionReport {
  return {
    id: inspection.id,
    scaffold_number: scaffold.scaffold_number,
    sequence_number: inspection.sequence_number,
    tag_number: scaffold.tag_number,
    work_area: scaffold.work_area,
    scaffold_type: scaffold.scaffold_type,
    inspected_at: inspection.inspected_at,
    reason: inspection.inspection_reason,
    status: inspection.status,
    outcome: inspection.outcome,
    expires_at: inspection.expires_at,
    notes: inspection.notes,
    voided_at: inspection.voided_at,
    void_reason: inspection.void_reason,
    inspector: inspection.inspector ? { first_name: inspection.inspector.first_name, last_name: inspection.inspector.last_name } : null,
    items: inspection.items.map((item) => ({
      item_type: item.item_type,
      result: item.result,
      comment: item.comment,
      required_corrective_action: item.required_corrective_action,
      severity: item.severity,
    })),
    defects: defects.map((defect) => ({
      description: defect.description,
      severity: defect.severity,
      status: defect.status,
      due_date: defect.due_date,
      immediate_control: defect.immediate_control,
    })),
  };
}

/**
 * Scaffold Inspection PDF — scaffold number, inspection reference
 * (SI-{scaffold_number}-{sequence}), inspection date, inspector, scaffold
 * information, checklist/result, findings/defects, status, and void state/
 * reason where applicable. A voided inspection renders a prominent VOID
 * banner and its checklist/outcome are visually de-emphasized — it must
 * never look like a valid active inspection (this milestone's explicit
 * requirement).
 */
export function ScaffoldInspectionPdfDocument({ companyName, projectName, record }: ScaffoldInspectionPdfData) {
  const reference = formatInspectionReference({ scaffold_number: record.scaffold_number }, { sequence_number: record.sequence_number });
  const isVoided = Boolean(record.voided_at);
  const nonAcceptableItems = record.items.filter((item) => item.result !== "acceptable");

  return (
    <ReportPdfDocument companyName={companyName} projectName={projectName} reportTitle="Scaffold Inspection" reportReference={reference}>
      {isVoided && <PdfVoidBanner reason={record.void_reason} />}

      <PdfSection title="Overview">
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
          <PdfBadge
            label={isVoided ? "Voided" : (SCAFFOLD_INSPECTION_STATUS_LABELS[record.status as ScaffoldInspectionStatus] ?? formatPdfEnumLabel(record.status))}
            tone={isVoided ? "danger" : record.status === "finalized" ? "success" : "neutral"}
          />
          {!isVoided && record.outcome && (
            <PdfBadge
              label={SCAFFOLD_INSPECTION_OUTCOME_LABELS[record.outcome as ScaffoldInspectionOutcome] ?? formatPdfEnumLabel(record.outcome)}
              tone={record.outcome === "safe_for_use" ? "success" : record.outcome === "unsafe_do_not_use" ? "danger" : "warning"}
            />
          )}
        </View>
        <PdfFieldGrid>
          <PdfField label="Scaffold number" value={record.scaffold_number} />
          <PdfField label="Tag number" value={record.tag_number} />
          <PdfField label="Work area" value={record.work_area} />
          <PdfField label="Scaffold type" value={SCAFFOLD_TYPE_LABELS[record.scaffold_type as ScaffoldType] ?? formatPdfEnumLabel(record.scaffold_type)} />
          <PdfField label="Inspected at" value={formatPdfDate(record.inspected_at)} />
          <PdfField label="Reason" value={SCAFFOLD_INSPECTION_REASON_LABELS[record.reason as ScaffoldInspectionReason] ?? formatPdfEnumLabel(record.reason)} />
          <PdfField label="Inspector" value={formatPdfPersonName(record.inspector)} />
          {!isVoided && <PdfField label="Valid until" value={formatPdfDate(record.expires_at)} />}
        </PdfFieldGrid>
        {record.notes && <PdfField label="Notes" value={record.notes} full />}
      </PdfSection>

      <PdfSection title={`Checklist (${record.items.length} items — ${nonAcceptableItems.length} flagged)`}>
        {nonAcceptableItems.length === 0 ? (
          <Text style={{ fontSize: 9, color: "#065f46" }}>All checklist items acceptable.</Text>
        ) : (
          nonAcceptableItems.map((item, index) => (
            <View key={index} style={{ flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#e5e7eb", paddingVertical: 4 }} wrap={false}>
              <Text style={{ fontSize: 8.5, width: "45%" }}>{SCAFFOLD_INSPECTION_ITEM_TYPE_LABELS[item.item_type as ScaffoldInspectionItemType] ?? formatPdfEnumLabel(item.item_type)}</Text>
              <Text style={{ fontSize: 8.5, width: "20%" }}>{SCAFFOLD_INSPECTION_ITEM_RESULT_LABELS[item.result as ScaffoldInspectionItemResult] ?? formatPdfEnumLabel(item.result)}</Text>
              <Text style={{ fontSize: 8.5, width: "35%" }}>{item.comment ?? "—"}</Text>
            </View>
          ))
        )}
      </PdfSection>

      <PdfSection title={`Findings / Defects (${record.defects.length})`}>
        {record.defects.length === 0 ? (
          <PdfEmptyState text="No defects raised against this inspection." />
        ) : (
          record.defects.map((defect, index) => (
            <View key={index} style={{ marginBottom: 6, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 3, padding: 6 }} wrap={false}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                <PdfBadge
                  label={SCAFFOLD_DEFECT_SEVERITY_LABELS[defect.severity as ScaffoldDefectSeverity] ?? formatPdfEnumLabel(defect.severity)}
                  tone={defect.severity === "critical" || defect.severity === "high" ? "danger" : "warning"}
                />
                <Text style={{ fontSize: 8, color: "#4b5563" }}>Due {formatPdfDate(defect.due_date)} · {formatPdfEnumLabel(defect.status)}</Text>
              </View>
              <Text style={{ fontSize: 8.5 }}>{defect.description}</Text>
              {defect.immediate_control && <Text style={{ fontSize: 8, color: "#4b5563", marginTop: 2 }}>Immediate control: {defect.immediate_control}</Text>}
            </View>
          ))
        )}
      </PdfSection>
    </ReportPdfDocument>
  );
}
