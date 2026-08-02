"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { createCorrectiveAction, updateCorrectiveActionDetails } from "@/modules/corrective-actions/actions";
import { CORRECTIVE_ACTION_PRIORITIES, CORRECTIVE_ACTION_PRIORITY_LABELS, type CorrectiveAction, type CorrectiveActionPriority, type BasicEmployee } from "@/modules/corrective-actions/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type CorrectiveActionFormDialogProps = {
  organizationId: string;
  observationId: string;
  projectId: string;
  candidates: BasicEmployee[];
  /** Undefined = create mode. */
  action?: CorrectiveAction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Create/edit a corrective action's core fields — mirrors modules/teams/components/team-form-dialog.tsx's dialog shape. */
export function CorrectiveActionFormDialog({ organizationId, observationId, projectId, candidates, action, open, onOpenChange }: CorrectiveActionFormDialogProps) {
  const router = useRouter();
  const mode = action ? "edit" : "create";
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [responsiblePersonId, setResponsiblePersonId] = useState(action?.responsible_person_id ?? "");
  const [priority, setPriority] = useState<CorrectiveActionPriority>(action?.priority ?? "medium");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    const formData = new FormData(event.currentTarget);
    const input = {
      description: String(formData.get("description") ?? ""),
      responsiblePersonId,
      priority,
      dueDate: String(formData.get("dueDate") ?? ""),
    };

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createCorrectiveAction(organizationId, observationId, projectId, input)
          : await updateCorrectiveActionDetails(organizationId, action!.id, observationId, projectId, input);

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
            <DialogTitle>{mode === "create" ? "New corrective action" : "Edit corrective action"}</DialogTitle>
            <DialogDescription>
              {mode === "create" ? "Raise a remediation task from this observation." : "Update this corrective action's details."}
            </DialogDescription>
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
              <Textarea id="description" name="description" rows={3} required defaultValue={action?.description} aria-invalid={Boolean(fieldErrors.description)} />
              {fieldErrors.description && <p className="text-sm text-destructive">{fieldErrors.description}</p>}
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
                <Label htmlFor="priority">Priority</Label>
                <Select value={priority} onValueChange={(value) => setPriority(value as CorrectiveActionPriority)}>
                  <SelectTrigger id="priority" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CORRECTIVE_ACTION_PRIORITIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {CORRECTIVE_ACTION_PRIORITY_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dueDate">Due date</Label>
              <Input id="dueDate" name="dueDate" type="date" required defaultValue={action?.due_date ?? ""} aria-invalid={Boolean(fieldErrors.dueDate)} />
              {fieldErrors.dueDate && <p className="text-sm text-destructive">{fieldErrors.dueDate}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : null}
              {isPending ? "Saving…" : mode === "create" ? "Create action" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
