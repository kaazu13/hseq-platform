import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ReactNode } from "react";

/**
 * Shared PDF layout primitives — reused by every generated report
 * (LMRA/Scaffold Inspection/Safety Observation/Corrective Action) so the
 * six-module "report/export architecture" (Phase 1) is genuinely one
 * shared system, not six bespoke ones. @react-pdf/renderer renders
 * server-side to a real PDF buffer (no headless browser/Puppeteer — pure
 * Node), which is what makes `renderToBuffer()` safe to call directly from
 * a Route Handler.
 *
 * Table header rows are NOT automatically repeated across page breaks —
 * @react-pdf/renderer has no built-in support for this (unlike pdfmake).
 * Each table row instead uses `wrap={false}` so an individual row is never
 * split mid-content across a page boundary, which is what "tables that do
 * not overflow" most concretely requires; true header repetition for a
 * report that grows long enough to need it is a disclosed limitation, not
 * silently ignored.
 */

export const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 48, paddingHorizontal: 40, fontSize: 9.5, fontFamily: "Helvetica", color: "#1f2937" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4, borderBottomWidth: 2, borderBottomColor: "#1f2937", paddingBottom: 10 },
  companyName: { fontSize: 13, fontWeight: 700 },
  projectName: { fontSize: 10, color: "#4b5563", marginTop: 2 },
  reportMeta: { alignItems: "flex-end" },
  reportTitle: { fontSize: 14, fontWeight: 700, textAlign: "right" },
  reportReference: { fontSize: 9, color: "#4b5563", marginTop: 2, textAlign: "right" },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: "#d1d5db", paddingBottom: 3 },
  fieldGrid: { flexDirection: "row", flexWrap: "wrap" },
  field: { width: "50%", marginBottom: 8, paddingRight: 8 },
  fieldFull: { width: "100%", marginBottom: 8 },
  fieldLabel: { fontSize: 7.5, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 1.5 },
  fieldValue: { fontSize: 9.5, color: "#111827" },
  badge: { fontSize: 8, fontWeight: 700, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 3, alignSelf: "flex-start" },
  badgeNeutral: { backgroundColor: "#e5e7eb", color: "#374151" },
  badgeSuccess: { backgroundColor: "#d1fae5", color: "#065f46" },
  badgeDanger: { backgroundColor: "#fee2e2", color: "#991b1b" },
  badgeWarning: { backgroundColor: "#fef3c7", color: "#92400e" },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e7eb", paddingVertical: 5 },
  rowHeader: { flexDirection: "row", backgroundColor: "#1f2937", paddingVertical: 5, paddingHorizontal: 2 },
  cellHeaderText: { fontSize: 8, fontWeight: 700, color: "#ffffff" },
  cellText: { fontSize: 8.5, color: "#1f2937" },
  emptyState: { fontSize: 9, color: "#9ca3af", fontStyle: "italic", marginTop: 4 },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: "#9ca3af", borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 6 },
  voidBanner: { backgroundColor: "#fee2e2", borderWidth: 1, borderColor: "#991b1b", borderRadius: 3, padding: 8, marginBottom: 12 },
  voidBannerText: { fontSize: 11, fontWeight: 700, color: "#991b1b" },
});

export function formatPdfDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit", timeZone: value.length === 10 ? "UTC" : undefined });
}

export function formatPdfDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function formatPdfPersonName(person: { first_name: string; last_name: string } | null | undefined): string {
  return person ? `${person.first_name} ${person.last_name}` : "—";
}

/** Title-cases a snake_case enum value for display ("working_at_height" -> "Working at height") — the one place every report does this, rather than re-deriving it per module. */
export function formatPdfEnumLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

type ReportPdfPageProps = {
  companyName: string;
  projectName?: string | null;
  reportTitle: string;
  reportReference: string;
  generatedAt?: Date;
  children: ReactNode;
};

/** The one page shell every generated report uses — company/project header, title/reference, and a footer with page number + generated timestamp on every page. */
export function ReportPdfDocument({ companyName, projectName, reportTitle, reportReference, generatedAt = new Date(), children }: ReportPdfPageProps) {
  return (
    <Document title={`${reportReference} — ${reportTitle}`} author="HSEQ Platform" creator="HSEQ Platform">
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.headerRow} fixed>
          <View>
            <Text style={styles.companyName}>{companyName}</Text>
            {projectName && <Text style={styles.projectName}>{projectName}</Text>}
          </View>
          <View style={styles.reportMeta}>
            <Text style={styles.reportTitle}>{reportTitle}</Text>
            <Text style={styles.reportReference}>{reportReference}</Text>
          </View>
        </View>

        {children}

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) => `Generated ${formatPdfDateTime(generatedAt.toISOString())}                                                                Page ${pageNumber} of ${totalPages}`}
        />
      </Page>
    </Document>
  );
}

export function PdfSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section} wrap>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function PdfField({ label, value, full }: { label: string; value: ReactNode; full?: boolean }) {
  return (
    <View style={full ? styles.fieldFull : styles.field} wrap={false}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export function PdfFieldGrid({ children }: { children: ReactNode }) {
  return <View style={styles.fieldGrid}>{children}</View>;
}

type BadgeTone = "neutral" | "success" | "danger" | "warning";
const BADGE_TONE_STYLES = { neutral: styles.badgeNeutral, success: styles.badgeSuccess, danger: styles.badgeDanger, warning: styles.badgeWarning };

export function PdfBadge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  return (
    <View style={[styles.badge, BADGE_TONE_STYLES[tone]]}>
      <Text>{label}</Text>
    </View>
  );
}

export function PdfEmptyState({ text }: { text: string }) {
  return <Text style={styles.emptyState}>{text}</Text>;
}

export function PdfVoidBanner({ reason }: { reason: string | null }) {
  return (
    <View style={styles.voidBanner} wrap={false}>
      <Text style={styles.voidBannerText}>VOID — this inspection was voided and is not a valid active record.</Text>
      {reason && <Text style={{ fontSize: 9, color: "#991b1b", marginTop: 3 }}>Reason: {reason}</Text>}
    </View>
  );
}

/** A compact table — each row uses wrap={false} so a row is never split mid-content across a page boundary (see this file's header comment on why headers themselves don't repeat). `widths` are flex-basis percentages summing to 100. */
export function PdfTable({ columns, rows }: { columns: { label: string; width: number }[]; rows: ReactNode[][] }) {
  return (
    <View>
      <View style={styles.rowHeader} fixed={false}>
        {columns.map((column, index) => (
          <Text key={index} style={[styles.cellHeaderText, { width: `${column.width}%` }]}>
            {column.label}
          </Text>
        ))}
      </View>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row} wrap={false}>
          {row.map((cell, cellIndex) => (
            <View key={cellIndex} style={{ width: `${columns[cellIndex].width}%` }}>
              {typeof cell === "string" || typeof cell === "number" ? <Text style={styles.cellText}>{cell}</Text> : cell}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
