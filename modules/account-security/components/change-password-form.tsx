"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { changeMyPassword } from "@/modules/account-security/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PasswordFieldProps = {
  id: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  error?: string;
  showLabel: string;
  hideLabel: string;
};

function PasswordField({ id, label, autoComplete, value, onChange, invalid, error, showLabel, hideLabel }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid}
          className="pr-8"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-1/2 right-0.5 -translate-y-1/2"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? hideLabel : showLabel}
        >
          {visible ? <EyeOff /> : <Eye />}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/**
 * Task 3 Part 31 — self-service password change; Account redesign wraps
 * this in a Dialog (see change-password-dialog.tsx) instead of rendering it
 * permanently on the page. Server-side reauthentication (verifying
 * currentPassword before applying newPassword) is the real security
 * boundary — see actions.ts's comment — this form only owns local UI state
 * and clears all three fields after a successful change so a stale
 * password never lingers in the DOM/history. `onSuccess` fires only after
 * that clearing, letting the caller show a toast and close the dialog.
 */
export function ChangePasswordForm({ onSuccess }: { onSuccess: () => void }) {
  const t = useTranslations("Account");
  const [isPending, startTransition] = useTransition();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleSubmit() {
    setFormError(null);
    setFieldErrors({});

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
      onSuccess();
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

      <div className="flex flex-col gap-4">
        <PasswordField
          id="currentPassword"
          label={t("currentPassword")}
          autoComplete="current-password"
          value={currentPassword}
          onChange={setCurrentPassword}
          invalid={Boolean(fieldErrors.currentPassword)}
          error={fieldErrors.currentPassword}
          showLabel={t("showPassword")}
          hideLabel={t("hidePassword")}
        />
        <PasswordField
          id="newPassword"
          label={t("newPassword")}
          autoComplete="new-password"
          value={newPassword}
          onChange={setNewPassword}
          invalid={Boolean(fieldErrors.newPassword)}
          error={fieldErrors.newPassword}
          showLabel={t("showPassword")}
          hideLabel={t("hidePassword")}
        />
        <PasswordField
          id="confirmPassword"
          label={t("confirmNewPassword")}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          invalid={Boolean(fieldErrors.confirmPassword)}
          error={fieldErrors.confirmPassword}
          showLabel={t("showPassword")}
          hideLabel={t("hidePassword")}
        />
      </div>

      <div className="flex justify-end">
        <Button type="button" size="sm" disabled={isPending} onClick={handleSubmit}>
          {isPending ? <Loader2 className="animate-spin" /> : null}
          {isPending ? t("saving") : t("changePassword")}
        </Button>
      </div>
    </div>
  );
}
