"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { createProject, updateProject } from "@/modules/projects/actions";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, type Project, type ProjectStatus } from "@/modules/projects/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ProjectFormProps =
  | { mode: "create"; organizationId: string; project?: undefined }
  | { mode: "edit"; organizationId: string; project: Project };

/**
 * Shared create/edit form — same field set either way (Assigned Project
 * Managers/HSEQ Managers are deliberately NOT here; that's the
 * Assignments tab, post-creation-only, mirroring how employee role
 * assignment is separate from the employee edit form). Plain `onSubmit` +
 * `preventDefault`, not `<form action={fn}>` — see
 * modules/employees/components/employee-form.tsx's header comment for why
 * (React 19's automatic form-reset on host form actions).
 */
export function ProjectForm({ mode, organizationId, project }: ProjectFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "planning");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    const input = {
      name: String(formData.get("name") ?? ""),
      clientName: String(formData.get("clientName") ?? ""),
      code: String(formData.get("code") ?? ""),
      description: String(formData.get("description") ?? ""),
      status,
      startDate: String(formData.get("startDate") ?? ""),
      endDate: String(formData.get("endDate") ?? ""),
      location: String(formData.get("location") ?? ""),
    };

    startTransition(async () => {
      const result = mode === "create" ? await createProject(organizationId, input) : await updateProject(organizationId, project.id, input);

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
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="name">Project name</Label>
          <Input id="name" name="name" required defaultValue={project?.name} aria-invalid={Boolean(fieldError("name"))} />
          {fieldError("name") && <p className="text-sm text-destructive">{fieldError("name")}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="clientName">Client</Label>
          <Input id="clientName" name="clientName" defaultValue={project?.client_name ?? ""} aria-invalid={Boolean(fieldError("clientName"))} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Project number / code (optional)</Label>
          <Input id="code" name="code" defaultValue={project?.code ?? ""} aria-invalid={Boolean(fieldError("code"))} />
          {fieldError("code") && <p className="text-sm text-destructive">{fieldError("code")}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status">Status</Label>
          <Select value={status} onValueChange={(value) => setStatus(value as ProjectStatus)}>
            <SelectTrigger id="status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {PROJECT_STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="location">Location</Label>
          <Input id="location" name="location" defaultValue={project?.location ?? ""} aria-invalid={Boolean(fieldError("location"))} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="startDate">Start date</Label>
          <Input id="startDate" name="startDate" type="date" defaultValue={project?.start_date ?? ""} aria-invalid={Boolean(fieldError("startDate"))} />
          {fieldError("startDate") && <p className="text-sm text-destructive">{fieldError("startDate")}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="endDate">End date</Label>
          <Input id="endDate" name="endDate" type="date" defaultValue={project?.end_date ?? ""} aria-invalid={Boolean(fieldError("endDate"))} />
          {fieldError("endDate") && <p className="text-sm text-destructive">{fieldError("endDate")}</p>}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" rows={3} defaultValue={project?.description ?? ""} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" /> : null}
          {isPending ? "Saving…" : mode === "create" ? "Create project" : "Save changes"}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
