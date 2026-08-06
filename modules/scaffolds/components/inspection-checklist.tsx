"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Plus } from "lucide-react";
import { updateInspectionItems } from "@/modules/scaffolds/actions";
import {
  SCAFFOLD_INSPECTION_ITEM_TYPES,
  SCAFFOLD_INSPECTION_ITEM_TYPE_LABELS,
  SCAFFOLD_DEFECT_SEVERITIES,
  SCAFFOLD_DEFECT_SEVERITY_LABELS,
  type ScaffoldInspectionItem,
  type ScaffoldInspectionItemResult,
  type ScaffoldDefectSeverity,
} from "@/modules/scaffolds/types";
import type { EmployeeOption } from "@/components/shared/employee-combobox";
import { ScaffoldDefectFormDialog } from "@/modules/scaffold-defects/components/scaffold-defect-form-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type ChecklistRow = {
  itemType: (typeof SCAFFOLD_INSPECTION_ITEM_TYPES)[number];
  result: ScaffoldInspectionItemResult;
  comment: string;
  requiredCorrectiveAction: string;
  severity: ScaffoldDefectSeverity | null;
};

function toRows(items: ScaffoldInspectionItem[]): ChecklistRow[] {
  const byType = new Map(items.map((item) => [item.item_type, item]));
  return SCAFFOLD_INSPECTION_ITEM_TYPES.map((itemType) => {
    const row = byType.get(itemType);
    return {
      itemType,
      result: row?.result ?? "acceptable",
      comment: row?.comment ?? "",
      requiredCorrectiveAction: row?.required_corrective_action ?? "",
      severity: row?.severity ?? null,
    };
  });
}

type InspectionChecklistProps = {
  companyId: string;
  inspectionId: string;
  scaffoldId: string;
  projectId: string;
  items: ScaffoldInspectionItem[];
  candidates: EmployeeOption[];
  readOnly: boolean;
};

/** The fixed 24-item scaffold safety checklist — mobile-first, one row at a time, mirroring modules/lmra/components/lmra-hazard-checklist.tsx's shape. A "Raise defect" shortcut on a defect_found row opens the defect dialog pre-linked to that checklist item ("checklist reference"). */
export function InspectionChecklist({ companyId, inspectionId, scaffoldId, projectId, items, candidates, readOnly }: InspectionChecklistProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [rows, setRows] = useState<ChecklistRow[]>(() => toRows(items));
  const [defectDialogItemType, setDefectDialogItemType] = useState<string | null>(null);

  function updateRow(index: number, patch: Partial<ChecklistRow>) {
    setRows((previous) => previous.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function handleSave() {
    setFormError(null);
    startTransition(async () => {
      const result = await updateInspectionItems(companyId, inspectionId, scaffoldId, projectId, rows);
      if (!result.ok) {
        setFormError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  const dialogItem = items.find((item) => item.item_type === defectDialogItemType);

  return (
    <div className="flex flex-col gap-4">
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertCircle />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col divide-y rounded-lg border">
        {rows.map((row, index) => (
          <div key={row.itemType} className="flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium">{SCAFFOLD_INSPECTION_ITEM_TYPE_LABELS[row.itemType]}</span>
              <Select value={row.result} onValueChange={(value) => updateRow(index, { result: value as ScaffoldInspectionItemResult, severity: value === "defect_found" ? (row.severity ?? "medium") : null })} disabled={readOnly}>
                <SelectTrigger size="sm" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="acceptable">Acceptable</SelectItem>
                  <SelectItem value="defect_found">Defect found</SelectItem>
                  <SelectItem value="not_applicable">Not applicable</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {row.result === "defect_found" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor={`comment-${row.itemType}`}>Comment</Label>
                  <Textarea id={`comment-${row.itemType}`} rows={2} disabled={readOnly} value={row.comment} onChange={(event) => updateRow(index, { comment: event.target.value })} />
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor={`corrective-${row.itemType}`}>Required corrective action</Label>
                  <Textarea
                    id={`corrective-${row.itemType}`}
                    rows={2}
                    disabled={readOnly}
                    value={row.requiredCorrectiveAction}
                    onChange={(event) => updateRow(index, { requiredCorrectiveAction: event.target.value })}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`severity-${row.itemType}`}>Severity (optional)</Label>
                  <Select value={row.severity ?? "none"} onValueChange={(value) => updateRow(index, { severity: value === "none" ? null : (value as ScaffoldDefectSeverity) })} disabled={readOnly}>
                    <SelectTrigger id={`severity-${row.itemType}`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not set</SelectItem>
                      {SCAFFOLD_DEFECT_SEVERITIES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {SCAFFOLD_DEFECT_SEVERITY_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {!readOnly && (
                  <div className="flex items-end">
                    <Button type="button" variant="outline" size="sm" onClick={() => setDefectDialogItemType(row.itemType)}>
                      <Plus />
                      Raise tracked defect
                    </Button>
                  </div>
                )}
              </div>
            )}

            {row.itemType === "other_identified_issue" && row.result !== "acceptable" && (
              <p className="text-xs text-muted-foreground">Use the comment above to describe the issue this row covers.</p>
            )}
          </div>
        ))}
      </div>

      {!readOnly && (
        <div>
          <Button type="button" onClick={handleSave} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : null}
            {isPending ? "Saving…" : "Save checklist"}
          </Button>
        </div>
      )}

      {dialogItem && (
        <ScaffoldDefectFormDialog
          companyId={companyId}
          inspectionId={inspectionId}
          scaffoldId={scaffoldId}
          projectId={projectId}
          candidates={candidates}
          inspectionItemId={dialogItem.id}
          open={defectDialogItemType !== null}
          onOpenChange={(open) => !open && setDefectDialogItemType(null)}
        />
      )}
    </div>
  );
}
