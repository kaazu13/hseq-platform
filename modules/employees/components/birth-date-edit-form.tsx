"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { updateMyBirthDate } from "@/modules/employees/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Task 3 Part 7 — own-view/edit only, no age/broad display anywhere. Kept
 * as its own small form (not folded into ProfileEditForm) since it writes
 * to `employees.birth_date` via a different Server Function/table than
 * profile.phone, and only ever renders when the caller has a linked
 * employee record in this company.
 */
export function BirthDateEditForm({ companyId, birthDate }: { companyId: string; birthDate: string | null }) {
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(birthDate ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function handleSubmit() {
    setFormError(null);
    setFieldError(null);
    setSavedAt(null);

    startTransition(async () => {
      const result = await updateMyBirthDate(companyId, { birthDate: value });
      if (!result.ok) {
        setFormError(result.error.message);
        setFieldError(result.error.fieldErrors?.birthDate ?? null);
      } else {
        setSavedAt(Date.now());
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertCircle />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      {savedAt && <p className="text-sm text-emerald-600 dark:text-emerald-400">Birth date updated.</p>}

      <div className="flex flex-col gap-1.5 sm:max-w-xs">
        <Label htmlFor="birthDate">Birth date (optional)</Label>
        <Input id="birthDate" type="date" value={value} onChange={(event) => setValue(event.target.value)} aria-invalid={Boolean(fieldError)} />
        {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
        <p className="text-xs text-muted-foreground">Only visible to you — never shown to coworkers, your Foreman, or displayed as an age anywhere.</p>
      </div>

      <div>
        <Button type="button" size="sm" disabled={isPending} onClick={handleSubmit}>
          {isPending ? <Loader2 className="animate-spin" /> : null}
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
