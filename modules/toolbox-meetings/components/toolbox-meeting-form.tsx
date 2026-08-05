"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Upload } from "lucide-react";
import { createToolboxMeeting } from "@/modules/toolbox-meetings/actions";
import { EmployeeComboboxField, type EmployeeOption } from "@/components/shared/employee-combobox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ToolboxMeetingFormProps = {
  organizationId: string;
  projectId: string;
  candidates: EmployeeOption[];
};

/** Create-only — a toolbox meeting's PDF and identity fields are locked once uploaded; corrections go through the controlled replace workflow, and metadata edits go through a separate, simpler edit form (see toolbox-meeting-edit-form.tsx). */
export function ToolboxMeetingForm({ organizationId, projectId, candidates }: ToolboxMeetingFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [heldByEmployeeId, setHeldByEmployeeId] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) {
      setFieldErrors({ file: "Attach the completed PDF" });
      return;
    }

    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("title", String(new FormData(form).get("title") ?? ""));
    formData.set("meetingDate", String(new FormData(form).get("meetingDate") ?? ""));
    formData.set("workArea", String(new FormData(form).get("workArea") ?? ""));
    formData.set("heldByEmployeeId", heldByEmployeeId);
    formData.set("notes", String(new FormData(form).get("notes") ?? ""));
    formData.set("file", file);

    startTransition(async () => {
      const result = await createToolboxMeeting(organizationId, formData);
      if (!result.ok) {
        setFormError(result.error.message);
        setFieldErrors(result.error.fieldErrors ?? {});
      }
    });
  }

  function fieldError(name: string) {
    return fieldErrors[name];
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertCircle />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="title">Toolbox meeting title</Label>
          <Input id="title" name="title" required placeholder="e.g. Line of Fire and Material Handling" aria-invalid={Boolean(fieldError("title"))} />
          {fieldError("title") && <p className="text-sm text-destructive">{fieldError("title")}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meetingDate">Date</Label>
          <Input id="meetingDate" name="meetingDate" type="date" required aria-invalid={Boolean(fieldError("meetingDate"))} />
          {fieldError("meetingDate") && <p className="text-sm text-destructive">{fieldError("meetingDate")}</p>}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="workArea">Work area (optional)</Label>
          <Input id="workArea" name="workArea" />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <EmployeeComboboxField
            label="HSE person who held the meeting"
            htmlFor="heldByEmployeeId"
            value={heldByEmployeeId || null}
            onValueChange={(id) => setHeldByEmployeeId(id ?? "")}
            options={candidates}
            placeholder="Choose the HSE person who held the meeting"
            clearable={false}
            error={fieldError("heldByEmployeeId")}
          />
          {candidates.length === 0 && <p className="text-sm text-muted-foreground">No HSE Manager/Officer is assigned to this project yet.</p>}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="file">Completed PDF (meeting content + attendance evidence)</Label>
          <label
            htmlFor="file"
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/50"
          >
            <Upload className="size-5" aria-hidden="true" />
            {fileName ?? "Choose a PDF file"}
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
          />
          {fieldError("file") && <p className="text-sm text-destructive">{fieldError("file")}</p>}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea id="notes" name="notes" rows={3} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" /> : null}
          {isPending ? "Uploading…" : "Save toolbox meeting"}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
