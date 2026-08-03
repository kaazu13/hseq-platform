"use client";

import { useState, useTransition, type FormEvent } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { updateSafetyFlashMetadata } from "@/modules/safety-flash/actions";
import { HSEQ_DOCUMENT_CATEGORIES, HSEQ_DOCUMENT_CATEGORY_LABELS, SUGGESTED_DOCUMENT_LANGUAGES, type HseqDocumentCategory } from "@/modules/toolbox-templates/types";
import type { SafetyFlash } from "@/modules/safety-flash/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type SafetyFlashEmployeeOption = { id: string; first_name: string; last_name: string };

export function SafetyFlashEditForm({ organizationId, flash, candidates }: { organizationId: string; flash: SafetyFlash; candidates: SafetyFlashEmployeeOption[] }) {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [category, setCategory] = useState<HseqDocumentCategory>(flash.category);
  const [issuedByEmployeeId, setIssuedByEmployeeId] = useState(flash.issued_by_employee_id);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSavedAt(null);

    const formData = new FormData(event.currentTarget);
    const input = {
      title: String(formData.get("title") ?? ""),
      dateIssued: String(formData.get("dateIssued") ?? ""),
      category,
      language: String(formData.get("language") ?? ""),
      issuedByEmployeeId,
      summary: String(formData.get("summary") ?? ""),
    };

    startTransition(async () => {
      const result = await updateSafetyFlashMetadata(organizationId, flash.id, flash.project_id, input);
      if (!result.ok) {
        setFormError(result.error.message);
        setFieldErrors(result.error.fieldErrors ?? {});
      } else {
        setSavedAt(Date.now());
      }
    });
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
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required defaultValue={flash.title} aria-invalid={Boolean(fieldErrors.title)} />
          {fieldErrors.title && <p className="text-sm text-destructive">{fieldErrors.title}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dateIssued">Date issued</Label>
          <Input id="dateIssued" name="dateIssued" type="date" required defaultValue={flash.date_issued} aria-invalid={Boolean(fieldErrors.dateIssued)} />
          {fieldErrors.dateIssued && <p className="text-sm text-destructive">{fieldErrors.dateIssued}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="category">Category</Label>
          <Select value={category} onValueChange={(value) => setCategory(value as HseqDocumentCategory)}>
            <SelectTrigger id="category" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HSEQ_DOCUMENT_CATEGORIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {HSEQ_DOCUMENT_CATEGORY_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="language">Language</Label>
          <Input id="language" name="language" required list="suggested-languages-flash-edit" defaultValue={flash.language} aria-invalid={Boolean(fieldErrors.language)} />
          <datalist id="suggested-languages-flash-edit">
            {SUGGESTED_DOCUMENT_LANGUAGES.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          {fieldErrors.language && <p className="text-sm text-destructive">{fieldErrors.language}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="issuedByEmployeeId">Issued by</Label>
          <Select value={issuedByEmployeeId} onValueChange={(value) => setIssuedByEmployeeId(value ?? "")}>
            <SelectTrigger id="issuedByEmployeeId" className="w-full" aria-invalid={Boolean(fieldErrors.issuedByEmployeeId)}>
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
          {fieldErrors.issuedByEmployeeId && <p className="text-sm text-destructive">{fieldErrors.issuedByEmployeeId}</p>}
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="summary">Summary (optional)</Label>
          <Textarea id="summary" name="summary" rows={2} defaultValue={flash.summary ?? ""} />
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
