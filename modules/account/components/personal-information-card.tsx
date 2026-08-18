"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertCircle, Loader2 } from "lucide-react";
import { updateOwnProfile } from "@/modules/companies/actions";
import { updateMyBirthDate } from "@/modules/employees/actions";
import { PhoneInput } from "@/components/shared/phone-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PersonalInformationCardProps = {
  companyId: string;
  fullName: string;
  phone: string | null;
  /** null when the caller has no linked employee record — birth date is an employee-record field, so editing it is skipped entirely in that case. */
  birthDate: string | null;
  hasEmployeeRecord: boolean;
};

/**
 * Account redesign (Section 3) — phone and birth date grouped into ONE
 * section with a single Edit -> Cancel/Save flow, replacing the previous
 * two separate always-editable forms (ProfileEditForm + BirthDateEditForm),
 * each with its own Save button. `updateOwnProfile` (profiles.phone) and
 * `updateMyBirthDate` (employees.birth_date) are still two distinct Server
 * Functions writing to two distinct tables — unchanged, per the "do not
 * change authorization semantics" constraint — this component just calls
 * both from one submit handler so the user only ever sees one Save action.
 * full_name stays read-only here regardless of role: Platform Super Admin
 * changes it elsewhere (RLS still enforces this either way).
 */
export function PersonalInformationCard({ companyId, fullName, phone, birthDate, hasEmployeeRecord }: PersonalInformationCardProps) {
  const t = useTranslations("Account");
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [phoneValue, setPhoneValue] = useState(phone ?? "");
  const [birthDateValue, setBirthDateValue] = useState(birthDate ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function startEditing() {
    setPhoneValue(phone ?? "");
    setBirthDateValue(birthDate ?? "");
    setFormError(null);
    setFieldErrors({});
    setEditing(true);
  }

  function cancelEditing() {
    setPhoneValue(phone ?? "");
    setBirthDateValue(birthDate ?? "");
    setFormError(null);
    setFieldErrors({});
    setEditing(false);
  }

  function handleSubmit() {
    setFormError(null);
    setFieldErrors({});

    startTransition(async () => {
      const [profileResult, birthDateResult] = await Promise.all([
        updateOwnProfile({ phone: phoneValue }),
        hasEmployeeRecord ? updateMyBirthDate(companyId, { birthDate: birthDateValue }) : Promise.resolve({ ok: true as const, data: null }),
      ]);

      const errors: Record<string, string> = {};
      let message: string | null = null;

      if (!profileResult.ok) {
        message = profileResult.error.message;
        Object.assign(errors, profileResult.error.fieldErrors);
      }
      if (!birthDateResult.ok) {
        message = birthDateResult.error.message;
        if (birthDateResult.error.fieldErrors?.birthDate) errors.birthDate = birthDateResult.error.fieldErrors.birthDate;
      }

      if (message) {
        setFormError(message);
        setFieldErrors(errors);
        return;
      }

      setEditing(false);
      toast.success(t("personalInformationUpdated"));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("personalInformation")}</CardTitle>
        <CardDescription>{t("personalInformationDescription")}</CardDescription>
        {!editing && (
          <CardAction>
            <Button type="button" variant="outline" size="sm" onClick={startEditing}>
              {tCommon("edit")}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {formError && (
          <Alert variant="destructive" role="alert">
            <AlertCircle />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-1.5">
          <Label>{t("fullName")}</Label>
          <p className="text-sm font-medium">{fullName}</p>
          <p className="text-xs text-muted-foreground">{t("fullNameManagedNote")}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">{t("phone")}</Label>
          {editing ? (
            <PhoneInput id="phone" value={phoneValue} onChange={setPhoneValue} invalid={Boolean(fieldErrors.phone)} disabled={isPending} />
          ) : (
            <p className="text-sm font-medium">{phone ? phone : t("phoneNotSet")}</p>
          )}
          {fieldErrors.phone && <p className="text-sm text-destructive">{fieldErrors.phone}</p>}
          <p className="text-xs text-muted-foreground">{t("phonePrivacyNote")}</p>
        </div>

        {hasEmployeeRecord && (
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="birthDate">{t("birthDate")}</Label>
            {editing ? (
              <Input
                id="birthDate"
                type="date"
                value={birthDateValue}
                onChange={(event) => setBirthDateValue(event.target.value)}
                aria-invalid={Boolean(fieldErrors.birthDate)}
                disabled={isPending}
              />
            ) : (
              <p className="text-sm font-medium">{birthDate ? format.dateTime(new Date(birthDate), { dateStyle: "long" }) : t("birthDateNotSet")}</p>
            )}
            {fieldErrors.birthDate && <p className="text-sm text-destructive">{fieldErrors.birthDate}</p>}
            <p className="text-xs text-muted-foreground">{t("birthDatePrivacyNote")}</p>
          </div>
        )}

        {editing && (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={cancelEditing}>
              {tCommon("cancel")}
            </Button>
            <Button type="button" size="sm" disabled={isPending} onClick={handleSubmit}>
              {isPending ? <Loader2 className="animate-spin" /> : null}
              {isPending ? t("saving") : t("saveChanges")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
