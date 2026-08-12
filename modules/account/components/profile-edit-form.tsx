"use client";

import { useState, useTransition, type FormEvent } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { updateOwnProfile } from "@/modules/companies/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Item 10: `fullName` is read-only display text, not an input — a user
 * can no longer self-edit their own display name (only a Platform Super
 * Admin can, via a dedicated authorized path). Phone stays freely
 * self-editable, unchanged.
 */
export function ProfileEditForm({ fullName, phone }: { fullName: string; phone: string | null }) {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSavedAt(null);

    const formData = new FormData(event.currentTarget);
    const input = {
      phone: String(formData.get("phone") ?? ""),
    };

    startTransition(async () => {
      const result = await updateOwnProfile(input);
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
      {savedAt && <p className="text-sm text-emerald-600 dark:text-emerald-400">Profile updated.</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fullName">Full name</Label>
          <p id="fullName" className="text-sm text-muted-foreground">
            {fullName}
          </p>
          <p className="text-xs text-muted-foreground">Only a Platform Super Admin can change your name.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input id="phone" name="phone" defaultValue={phone ?? ""} aria-invalid={Boolean(fieldErrors.phone)} />
          {fieldErrors.phone && <p className="text-sm text-destructive">{fieldErrors.phone}</p>}
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
