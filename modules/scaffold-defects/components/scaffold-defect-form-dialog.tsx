"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { createScaffoldDefect, updateScaffoldDefectDetails } from "@/modules/scaffold-defects/actions";
import { SCAFFOLD_DEFECT_SEVERITIES, SCAFFOLD_DEFECT_SEVERITY_LABELS, type ScaffoldDefect, type ScaffoldDefectSeverity, type BasicEmployee } from "@/modules/scaffold-defects/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ScaffoldDefectFormDialogProps = {
  organizationId: string;
  inspectionId: string;
  scaffoldId: string;
  projectId: string;
  candidates: BasicEmployee[];
  /** Pre-fills inspection_item_id when raised directly from a checklist row (create mode only). */
  inspectionItemId?: string;
  /** Undefined = create mode. */
  defect?: ScaffoldDefect;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Create/edit a scaffold defect's core fields — mirrors modules/corrective-actions/components/corrective-action-form-dialog.tsx's dialog shape. */
export function ScaffoldDefectFormDialog({ organizationId, inspectionId, scaffoldId, projectId, candidates, inspectionItemId, defect, open, onOpenChange }: ScaffoldDefectFormDialogProps) {
  const router = useRouter();
  const mode = defect ? "edit" : "create";
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [responsiblePersonId, setResponsiblePersonId] = useState(defect?.responsible_person_id ?? "");
  const [severity, setSeverity] = useState<ScaffoldDefectSeverity>(defect?.severity ?? "medium");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    const formData = new FormData(event.currentTarget);
    const input = {
      description: String(formData.get("description") ?? ""),
      severity,
      responsiblePersonId,
      dueDate: String(formData.get("dueDate") ?? ""),
      immediateControl: String(formData.get("immediateControl") ?? ""),
      inspectionItemId: defect?.inspection_item_id ?? inspectionItemId ?? "",
    };

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createScaffoldDefect(organizationId, inspectionId, scaffoldId, projectId, input)
          : await updateScaffoldDefectDetails(organizationId, defect!.id, inspectionId, scaffoldId, projectId, input);

      if (!result.ok) {
        setFormError(result.error.message);
        setFieldErrors(result.error.fieldErrors ?? {});
        return;
      }

      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "New defect" : "Edit defect"}</DialogTitle>
            <DialogDescription>{mode === "create" ? "Raise a remediation item from this inspection." : "Update this defect's details."}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {formError && (
              <Alert variant="destructive" role="alert">
                <AlertCircle />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" rows={3} required defaultValue={defect?.description} aria-invalid={Boolean(fieldErrors.description)} />
              {fieldErrors.description && <p className="text-sm text-destructive">{fieldErrors.description}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="immediateControl">Immediate control (optional)</Label>
              <Textarea id="immediateControl" name="immediateControl" rows={2} defaultValue={defect?.immediate_control ?? ""} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="responsiblePersonId">Responsible person</Label>
                <Select value={responsiblePersonId} onValueChange={(value) => setResponsiblePersonId(value ?? "")}>
                  <SelectTrigger id="responsiblePersonId" className="w-full" aria-invalid={Boolean(fieldErrors.responsiblePersonId)}>
                    <SelectValue placeholder="Choose someone" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.first_name} {candidate.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.responsiblePersonId && <p className="text-sm text-destructive">{fieldErrors.responsiblePersonId}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="severity">Severity</Label>
                <Select value={severity} onValueChange={(value) => setSeverity(value as ScaffoldDefectSeverity)}>
                  <SelectTrigger id="severity" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCAFFOLD_DEFECT_SEVERITIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {SCAFFOLD_DEFECT_SEVERITY_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dueDate">Due date</Label>
              <Input id="dueDate" name="dueDate" type="date" required defaultValue={defect?.due_date ?? ""} aria-invalid={Boolean(fieldErrors.dueDate)} />
              {fieldErrors.dueDate && <p className="text-sm text-destructive">{fieldErrors.dueDate}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : null}
              {isPending ? "Saving…" : mode === "create" ? "Create defect" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
