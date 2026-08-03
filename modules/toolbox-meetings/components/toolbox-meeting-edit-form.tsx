"use client";

import { useState, useTransition, type FormEvent } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { updateToolboxMeetingMetadata } from "@/modules/toolbox-meetings/actions";
import type { ToolboxMeeting } from "@/modules/toolbox-meetings/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ToolboxEmployeeOption = { id: string; first_name: string; last_name: string };

export function ToolboxMeetingEditForm({ organizationId, meeting, candidates }: { organizationId: string; meeting: ToolboxMeeting; candidates: ToolboxEmployeeOption[] }) {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [heldByEmployeeId, setHeldByEmployeeId] = useState(meeting.held_by_employee_id);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSavedAt(null);

    const formData = new FormData(event.currentTarget);
    const input = {
      title: String(formData.get("title") ?? ""),
      meetingDate: String(formData.get("meetingDate") ?? ""),
      workArea: String(formData.get("workArea") ?? ""),
      heldByEmployeeId,
      notes: String(formData.get("notes") ?? ""),
    };

    startTransition(async () => {
      const result = await updateToolboxMeetingMetadata(organizationId, meeting.id, meeting.project_id, input);
      if (!result.ok) {
        setFormError(result.error.message);
        setFieldErrors(result.error.fieldErrors ?? {});
      } else {
        setSavedAt(Date.now());
      }
    });
  }

  function fieldError(name: string) {
    return fieldErrors[name];
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertCircle />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      {savedAt && <p className="text-sm text-emerald-600 dark:text-emerald-400">Changes saved.</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required defaultValue={meeting.title} aria-invalid={Boolean(fieldError("title"))} />
          {fieldError("title") && <p className="text-sm text-destructive">{fieldError("title")}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meetingDate">Date</Label>
          <Input id="meetingDate" name="meetingDate" type="date" required defaultValue={meeting.meeting_date} aria-invalid={Boolean(fieldError("meetingDate"))} />
          {fieldError("meetingDate") && <p className="text-sm text-destructive">{fieldError("meetingDate")}</p>}
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="workArea">Work area (optional)</Label>
          <Input id="workArea" name="workArea" defaultValue={meeting.work_area ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="heldByEmployeeId">HSE person who held the meeting</Label>
          <Select value={heldByEmployeeId} onValueChange={(value) => setHeldByEmployeeId(value ?? "")}>
            <SelectTrigger id="heldByEmployeeId" className="w-full" aria-invalid={Boolean(fieldError("heldByEmployeeId"))}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {candidate.first_name} {candidate.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldError("heldByEmployeeId") && <p className="text-sm text-destructive">{fieldError("heldByEmployeeId")}</p>}
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea id="notes" name="notes" rows={3} defaultValue={meeting.notes ?? ""} />
        </div>
      </div>

      <div>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" /> : null}
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
