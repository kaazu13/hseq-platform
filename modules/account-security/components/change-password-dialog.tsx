"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { ChangePasswordForm } from "@/modules/account-security/components/change-password-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * Account redesign (Section 7/8) — password fields are never rendered on
 * the main page; they only exist inside this dialog while it's open.
 * Base UI's Dialog (components/ui/dialog.tsx) already gives us a focus
 * trap and Escape-to-close for free, same as every other modal in this
 * codebase. `key={open}` remounts ChangePasswordForm on each open so a
 * password typed and abandoned in a previous open never lingers in state.
 */
export function ChangePasswordDialog() {
  const t = useTranslations("Account");
  const [open, setOpen] = useState(false);

  function handleSuccess() {
    setOpen(false);
    toast.success(t("passwordUpdated"));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <KeyRound />
        {t("changePassword")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("changePassword")}</DialogTitle>
          <DialogDescription>{t("changePasswordDescription")}</DialogDescription>
        </DialogHeader>
        <ChangePasswordForm key={String(open)} onSuccess={handleSuccess} />
      </DialogContent>
    </Dialog>
  );
}
