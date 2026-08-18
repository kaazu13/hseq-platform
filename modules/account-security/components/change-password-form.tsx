"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { changeMyPassword } from "@/modules/account-security/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Task 3 Part 31 — self-service password change, mirroring
 * modules/account/components/profile-edit-form.tsx's exact form pattern
 * (useTransition + inline field errors + a transient "saved" message).
 * Server-side reauthentication (verifying currentPassword before applying
 * newPassword) is the real security boundary — see actions.ts's comment —
 * this form only owns local UI state and clears all three fields after a
 * successful change so a stale password never lingers in the DOM/history.
 */
export function ChangePasswordForm() {
  const t = useTranslations("Account");
  const [isPending, startTransition] = useTransition();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function handleSubmit() {
    setFormError(null);
    setFieldErrors({});
    setSavedAt(null);

    startTransition(async () => {
      const result = await changeMyPassword({ currentPassword, newPassword, confirmPassword });
      if (!result.ok) {
        setFormError(result.error.message);
        setFieldErrors(result.error.fieldErrors ?? {});
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSavedAt(Date.now());
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertCircle />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      {savedAt && <p className="text-sm text-emerald-600 dark:text-emerald-400">{t("passwordUpdated")}</p>}

      <div className="flex flex-col gap-4 sm:max-w-sm">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="currentPassword">{t("currentPassword")}</Label>
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            aria-invalid={Boolean(fieldErrors.currentPassword)}
          />
          {fieldErrors.currentPassword && <p className="text-sm text-destructive">{fieldErrors.currentPassword}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="newPassword">{t("newPassword")}</Label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            aria-invalid={Boolean(fieldErrors.newPassword)}
          />
          {fieldErrors.newPassword && <p className="text-sm text-destructive">{fieldErrors.newPassword}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirmPassword">{t("confirmNewPassword")}</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            aria-invalid={Boolean(fieldErrors.confirmPassword)}
          />
          {fieldErrors.confirmPassword && <p className="text-sm text-destructive">{fieldErrors.confirmPassword}</p>}
        </div>
      </div>

      <div>
        <Button type="button" size="sm" disabled={isPending} onClick={handleSubmit}>
          {isPending ? <Loader2 className="animate-spin" /> : null}
          {isPending ? t("saving") : t("changePassword")}
        </Button>
      </div>
    </div>
  );
}
