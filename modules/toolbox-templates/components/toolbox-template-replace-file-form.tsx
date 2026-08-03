"use client";

import { useState, useTransition, type FormEvent } from "react";
import { AlertCircle, Loader2, Upload } from "lucide-react";
import { replaceToolboxTemplateFile } from "@/modules/toolbox-templates/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** "Upload a replacement as a new controlled version" — always requires a reason; never a silent overwrite. */
export function ToolboxTemplateReplaceFileForm({ organizationId, templateId }: { organizationId: string; templateId: string }) {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successAt, setSuccessAt] = useState<number | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSuccessAt(null);

    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await replaceToolboxTemplateFile(organizationId, templateId, formData);
      if (!result.ok) {
        setFormError(result.error.message);
        setFieldErrors(result.error.fieldErrors ?? {});
      } else {
        setSuccessAt(Date.now());
        event.currentTarget.reset();
        setFileName(null);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertCircle />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      {successAt && <p className="text-sm text-emerald-600 dark:text-emerald-400">The template was replaced with a new version. The previous version is retained in the replacement history below.</p>}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="replace-template-file">New version PDF</Label>
        <label htmlFor="replace-template-file" className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/50">
          <Upload className="size-5" aria-hidden="true" />
          {fileName ?? "Choose the replacement PDF file"}
        </label>
        <input id="replace-template-file" name="file" type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)} />
        {fieldErrors.file && <p className="text-sm text-destructive">{fieldErrors.file}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reason">Reason for replacement</Label>
        <Textarea id="reason" name="reason" rows={2} required aria-invalid={Boolean(fieldErrors.reason)} placeholder="e.g. Updated to the latest revision" />
        {fieldErrors.reason && <p className="text-sm text-destructive">{fieldErrors.reason}</p>}
      </div>

      <div>
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" /> : null}
          {isPending ? "Replacing…" : "Upload new version"}
        </Button>
      </div>
    </form>
  );
}
