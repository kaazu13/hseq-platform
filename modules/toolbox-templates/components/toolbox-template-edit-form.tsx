"use client";

import { useState, useTransition, type FormEvent } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { updateToolboxTemplateMetadata } from "@/modules/toolbox-templates/actions";
import { HSEQ_DOCUMENT_CATEGORIES, HSEQ_DOCUMENT_CATEGORY_LABELS, SUGGESTED_DOCUMENT_LANGUAGES, type HseqDocumentCategory, type ToolboxTemplate } from "@/modules/toolbox-templates/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function ToolboxTemplateEditForm({ companyId, template }: { companyId: string; template: ToolboxTemplate }) {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [category, setCategory] = useState<HseqDocumentCategory>(template.category);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSavedAt(null);

    const formData = new FormData(event.currentTarget);
    const input = {
      title: String(formData.get("title") ?? ""),
      category,
      language: String(formData.get("language") ?? ""),
      description: String(formData.get("description") ?? ""),
    };

    startTransition(async () => {
      const result = await updateToolboxTemplateMetadata(companyId, template.id, input);
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
          <Input id="title" name="title" required defaultValue={template.title} aria-invalid={Boolean(fieldErrors.title)} />
          {fieldErrors.title && <p className="text-sm text-destructive">{fieldErrors.title}</p>}
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
          <Input id="language" name="language" required list="suggested-languages-edit" defaultValue={template.language} aria-invalid={Boolean(fieldErrors.language)} />
          <datalist id="suggested-languages-edit">
            {SUGGESTED_DOCUMENT_LANGUAGES.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          {fieldErrors.language && <p className="text-sm text-destructive">{fieldErrors.language}</p>}
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="description">Description (optional)</Label>
          <Textarea id="description" name="description" rows={2} defaultValue={template.description ?? ""} />
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
