import Link from "next/link";
import { ShieldCheck, Building2, FolderKanban, Download } from "lucide-react";
import type {
  PublicReportPayload,
  PublicLmraReport,
  PublicScaffoldInspectionReport,
  PublicSafetyObservationReport,
  PublicCorrectiveActionReport,
  PublicDocumentReport,
} from "@/modules/reports/types";
import { REPORT_RECORD_TYPE_LABELS, isDocumentPassthroughRecordType } from "@/modules/reports/types";
import { formatLmraReference, LMRA_SHIFT_LABELS, type LmraShift } from "@/modules/lmra/types";
import { formatInspectionReference } from "@/modules/scaffolds/types";
import { formatObservationReference } from "@/modules/observations/types";
import { formatCorrectiveActionReference } from "@/modules/corrective-actions/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: value.length === 10 ? "UTC" : undefined });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function personName(person: { first_name: string; last_name: string } | null): string {
  return person ? `${person.first_name} ${person.last_name}` : "—";
}

function titleCase(value: string): string {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function reportReference(payload: PublicReportPayload): string {
  const { record_type } = payload.share;
  if (record_type === "lmra") return formatLmraReference({ id: (payload.record as PublicLmraReport).id });
  if (record_type === "scaffold_inspection") {
    const record = payload.record as PublicScaffoldInspectionReport;
    return formatInspectionReference({ scaffold_number: record.scaffold_number }, { sequence_number: record.sequence_number });
  }
  if (record_type === "safety_observation") return formatObservationReference({ id: (payload.record as PublicSafetyObservationReport).id });
  if (record_type === "corrective_action") return formatCorrectiveActionReference({ id: (payload.record as PublicCorrectiveActionReport).id });
  const doc = payload.record as PublicDocumentReport;
  return `${REPORT_RECORD_TYPE_LABELS[record_type]}-${doc.id.slice(0, 8).toUpperCase()}`;
}

/**
 * The public, read-only view for a shared report (app/share/[token]/page.tsx)
 * — no sidebar, no internal navigation, no ability to mutate anything.
 * Renders whatever resolve_public_report() returned; the generated-PDF
 * types offer a "Download PDF" link to /share/[token]/pdf, the two
 * document-passthrough types (Toolbox Meeting/Safety Flash) link straight
 * to a freshly generated signed URL for the ONE underlying file the share
 * covers.
 */
export function PublicReportView({ payload, token }: { payload: PublicReportPayload; token: string }) {
  const { record_type } = payload.share;
  const reference = reportReference(payload);
  const isPassthrough = isDocumentPassthroughRecordType(record_type);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-8">
      <div className="flex flex-col gap-1 border-b pb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4" />
          Shared report — read only
        </div>
        <h1 className="text-xl font-semibold">
          {REPORT_RECORD_TYPE_LABELS[record_type]} · {reference}
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {payload.company && (
            <span className="flex items-center gap-1.5">
              <Building2 className="size-3.5" />
              {payload.company.name}
            </span>
          )}
          {payload.project && (
            <span className="flex items-center gap-1.5">
              <FolderKanban className="size-3.5" />
              {payload.project.name}
            </span>
          )}
        </div>
      </div>

      {record_type === "lmra" && <LmraPublicView record={payload.record as PublicLmraReport} />}
      {record_type === "scaffold_inspection" && <ScaffoldInspectionPublicView record={payload.record as PublicScaffoldInspectionReport} />}
      {record_type === "safety_observation" && <ObservationPublicView record={payload.record as PublicSafetyObservationReport} />}
      {record_type === "corrective_action" && <CorrectiveActionPublicView record={payload.record as PublicCorrectiveActionReport} />}
      {isPassthrough && <DocumentPublicView record={payload.record as PublicDocumentReport} />}

      <div className="flex items-center gap-2 border-t pt-4">
        <Button size="sm" nativeButton={false} render={<Link href={`/share/${token}/pdf`} />}>
          <Download />
          {isPassthrough ? "Download" : "Download PDF"}
        </Button>
      </div>

      <p className="text-center text-xs text-muted-foreground">This is a secure, read-only shared view. It cannot be used to sign in or modify any record.</p>
    </div>
  );
}

function LmraPublicView({ record }: { record: PublicLmraReport }) {
  const applicableHazards = record.hazards.filter((h) => h.is_applicable);
  return (
    <>
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
          <div className="flex gap-2 sm:col-span-2">
            <Badge>{titleCase(record.status)}</Badge>
            {record.status !== "draft" && <Badge variant={record.result === "go" ? "default" : "destructive"}>{record.result === "go" ? "Go" : "No-Go"}</Badge>}
          </div>
          <Field label="Work area" value={record.work_area} />
          <Field label="Work activity" value={record.work_activity} />
          <Field label="Date" value={formatDate(record.work_date)} />
          <Field label="Shift" value={LMRA_SHIFT_LABELS[record.shift as LmraShift] ?? titleCase(record.shift)} />
          <Field label="LMRA completed by" value={personName(record.completed_by)} />
          <Field label="Person responsible for the work" value={record.responsible_person ? personName(record.responsible_person) : "Not set"} />
          {record.result === "no_go" && record.stop_work_reason && <Field label="Stop-work reason" value={record.stop_work_reason} />}
          {record.notes && <Field label="Notes" value={record.notes} />}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Workers involved ({record.participants.length})</h2>
        {record.participants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No workers recorded.</p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 text-sm">
            {record.participants.map((p, i) => (
              <span key={i}>• {personName(p)}</span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Hazards identified &amp; control measures ({applicableHazards.length})</h2>
        {applicableHazards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hazards were marked applicable.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {applicableHazards.map((hazard, i) => (
              <Card key={i}>
                <CardContent className="flex flex-col gap-1.5 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{titleCase(hazard.hazard_type)}</span>
                    <Badge variant={hazard.controls_confirmed ? "default" : "secondary"}>{hazard.controls_confirmed ? "Controls verified" : "Not verified"}</Badge>
                  </div>
                  {hazard.selected_controls.length > 0 && (
                    <ul className="list-disc pl-4 text-sm text-muted-foreground">
                      {hazard.selected_controls.map((c, ci) => (
                        <li key={ci}>{c}</li>
                      ))}
                    </ul>
                  )}
                  {hazard.controls && <p className="text-sm">{hazard.controls}</p>}
                  {hazard.responsible_person && <p className="text-xs text-muted-foreground">Responsible: {personName(hazard.responsible_person)}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ScaffoldInspectionPublicView({ record }: { record: PublicScaffoldInspectionReport }) {
  const isVoided = Boolean(record.voided_at);
  const flagged = record.items.filter((item) => item.result !== "acceptable");
  return (
    <>
      {isVoided && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-4">
            <p className="text-sm font-semibold text-destructive">VOID — this inspection was voided and is not a valid active record.</p>
            {record.void_reason && <p className="text-sm text-muted-foreground">{record.void_reason}</p>}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
          <div className="flex gap-2 sm:col-span-2">
            <Badge variant={isVoided ? "destructive" : "default"}>{isVoided ? "Voided" : titleCase(record.status)}</Badge>
            {!isVoided && record.outcome && <Badge variant="secondary">{titleCase(record.outcome)}</Badge>}
          </div>
          <Field label="Scaffold number" value={record.scaffold_number} />
          <Field label="Tag number" value={record.tag_number} />
          <Field label="Work area" value={record.work_area} />
          <Field label="Scaffold type" value={titleCase(record.scaffold_type)} />
          <Field label="Inspected at" value={formatDate(record.inspected_at)} />
          <Field label="Inspector" value={personName(record.inspector)} />
          {!isVoided && <Field label="Valid until" value={formatDate(record.expires_at)} />}
          {record.notes && <Field label="Notes" value={record.notes} />}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">
          Checklist ({record.items.length} items — {flagged.length} flagged)
        </h2>
        {flagged.length === 0 ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">All checklist items acceptable.</p>
        ) : (
          <div className="flex flex-col divide-y rounded-lg border">
            {flagged.map((item, i) => (
              <div key={i} className="flex flex-col gap-0.5 p-3 text-sm">
                <span className="font-medium">{titleCase(item.item_type)}</span>
                <span className="text-muted-foreground">{titleCase(item.result)}{item.comment ? ` — ${item.comment}` : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Findings / defects ({record.defects.length})</h2>
        {record.defects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No defects raised against this inspection.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {record.defects.map((defect, i) => (
              <Card key={i}>
                <CardContent className="flex flex-col gap-1 pt-4">
                  <div className="flex items-center justify-between">
                    <Badge variant={defect.severity === "critical" || defect.severity === "high" ? "destructive" : "secondary"}>{titleCase(defect.severity)}</Badge>
                    <span className="text-xs text-muted-foreground">
                      Due {formatDate(defect.due_date)} · {titleCase(defect.status)}
                    </span>
                  </div>
                  <p className="text-sm">{defect.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ObservationPublicView({ record }: { record: PublicSafetyObservationReport }) {
  return (
    <>
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Badge>{titleCase(record.status)}</Badge>
            <Badge variant="secondary">{titleCase(record.observation_type)}</Badge>
            <Badge variant={record.risk_level === "critical" || record.risk_level === "high" ? "destructive" : "secondary"}>{titleCase(record.risk_level)}</Badge>
            {record.is_stop_work && <Badge variant="destructive">Stop work</Badge>}
          </div>
          <Field label="Work area" value={record.work_area} />
          <Field label="Observed at" value={formatDateTime(record.observed_at)} />
          <Field label="Category" value={titleCase(record.category)} />
          <Field label="Observer" value={personName(record.observer)} />
          <Field label="Description" value={record.description} />
          {record.immediate_action_taken && <Field label="Immediate action taken" value={record.immediate_action_taken} />}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Corrective actions ({record.corrective_actions.length})</h2>
        {record.corrective_actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No corrective actions raised.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {record.corrective_actions.map((action, i) => (
              <Card key={i}>
                <CardContent className="flex flex-col gap-1 pt-4">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">{titleCase(action.priority)}</Badge>
                    <span className="text-xs text-muted-foreground">
                      Due {formatDate(action.due_date)} · {titleCase(action.status)}
                    </span>
                  </div>
                  <p className="text-sm">{action.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function CorrectiveActionPublicView({ record }: { record: PublicCorrectiveActionReport }) {
  return (
    <Card>
      <CardContent className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Badge>{titleCase(record.status)}</Badge>
        </div>
        <Field label="Priority" value={titleCase(record.priority)} />
        <Field label="Due date" value={formatDate(record.due_date)} />
        <Field label="Responsible person" value={personName(record.responsible_person)} />
        <Field label="Description" value={record.description} />
        {record.completion_notes && <Field label="Completion notes" value={record.completion_notes} />}
        <div className="sm:col-span-2">
          <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Raised from</h3>
          <p className="text-sm">
            {record.observation.work_area} — {record.observation.description}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function DocumentPublicView({ record }: { record: PublicDocumentReport }) {
  return (
    <Card>
      <CardContent className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
        <Field label="Title" value={String(record.title ?? record.original_filename)} />
        <Field label="Status" value={titleCase(record.status)} />
        {"work_area" in record && record.work_area ? <Field label="Work area" value={String(record.work_area)} /> : null}
        {"meeting_date" in record && record.meeting_date ? <Field label="Meeting date" value={formatDate(String(record.meeting_date))} /> : null}
        {"date_issued" in record && record.date_issued ? <Field label="Date issued" value={formatDate(String(record.date_issued))} /> : null}
        {"held_by" in record && record.held_by ? <Field label="Held by" value={personName(record.held_by as { first_name: string; last_name: string })} /> : null}
        {"issued_by" in record && record.issued_by ? <Field label="Issued by" value={personName(record.issued_by as { first_name: string; last_name: string })} /> : null}
        {"summary" in record && record.summary ? <Field label="Summary" value={String(record.summary)} /> : null}
        {"notes" in record && record.notes ? <Field label="Notes" value={String(record.notes)} /> : null}
      </CardContent>
    </Card>
  );
}
