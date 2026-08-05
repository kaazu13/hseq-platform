"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Upload } from "lucide-react";
import { createSafetyFlash } from "@/modules/safety-flash/actions";
import type { Project } from "@/modules/projects/types";
import { HSEQ_DOCUMENT_CATEGORIES, HSEQ_DOCUMENT_CATEGORY_LABELS, SUGGESTED_DOCUMENT_LANGUAGES, type HseqDocumentCategory } from "@/modules/toolbox-templates/types";
import { EmployeeComboboxField, type EmployeeOption } from "@/components/shared/employee-combobox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function SafetyFlashForm({ organizationId, projects, candidates }: { organizationId: string; projects: Project[]; candidates: EmployeeOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [projectId, setProjectId] = useState("");
  const [category, setCategory] = useState<HseqDocumentCategory>("other");
  const [issuedByEmployeeId, setIssuedByEmployeeId] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) {
      setFieldErrors({ file: "Attach the Safety Flash PDF" });
      return;
    }

    const rawFormData = new FormData(form);
    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("title", String(rawFormData.get("title") ?? ""));
    formData.set("dateIssued", String(rawFormData.get("dateIssued") ?? ""));
    formData.set("category", category);
    formData.set("language", String(rawFormData.get("language") ?? ""));
    formData.set("issuedByEmployeeId", issuedByEmployeeId);
    formData.set("summary", String(rawFormData.get("summary") ?? ""));
    formData.set("file", file);

    startTransition(async () => {
      const result = await createSafetyFlash(organizationId, formData);
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
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required placeholder="e.g. Dropped Object Prevention" aria-invalid={Boolean(fieldError("title"))} />
          {fieldError("title") && <p className="text-sm text-destructive">{fieldError("title")}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="projectId">Project (optional — leave blank for organization-wide)</Label>
          <Select value={projectId || "none"} onValueChange={(value) => setProjectId(value === "none" ? "" : (value ?? ""))}>
            <SelectTrigger id="projectId" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Organization-wide (no project)</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dateIssued">Date issued</Label>
          <Input id="dateIssued" name="dateIssued" type="date" required aria-invalid={Boolean(fieldError("dateIssued"))} />
          {fieldError("dateIssued") && <p className="text-sm text-destructive">{fieldError("dateIssued")}</p>}
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
          <Input id="language" name="language" required list="suggested-languages-flash" defaultValue="English" aria-invalid={Boolean(fieldError("language"))} />
          <datalist id="suggested-languages-flash">
            {SUGGESTED_DOCUMENT_LANGUAGES.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          {fieldError("language") && <p className="text-sm text-destructive">{fieldError("language")}</p>}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <EmployeeComboboxField
            label="Issued by"
            htmlFor="issuedByEmployeeId"
            value={issuedByEmployeeId || null}
            onValueChange={(id) => setIssuedByEmployeeId(id ?? "")}
            options={candidates}
            placeholder="Choose who issued this Safety Flash"
            clearable={false}
            error={fieldError("issuedByEmployeeId")}
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="file">Safety Flash PDF</Label>
          <label htmlFor="file" className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/50">
            <Upload className="size-5" aria-hidden="true" />
            {fileName ?? "Choose a PDF file"}
          </label>
          <input id="file" name="file" type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)} />
          {fieldError("file") && <p className="text-sm text-destructive">{fieldError("file")}</p>}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="summary">Summary (optional)</Label>
          <Textarea id="summary" name="summary" rows={2} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" /> : null}
          {isPending ? "Uploading…" : "Save Safety Flash"}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
