"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateProjectLocationSettings } from "@/modules/projects/actions";
import { CountryCombobox } from "@/components/shared/country-combobox";
import { TimezoneCombobox } from "@/components/shared/timezone-combobox";
import { countryDisplayName } from "@/lib/phone";
import type { CountryCode } from "libphonenumber-js/min";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type ProjectLocationSettingsFormProps = {
  companyId: string;
  projectId: string;
  countryCode: string | null;
  timezone: string | null;
  /** Task 3 Part 12 — platform_super_admin/company_admin only; everyone else who reaches the Edit Project page still sees these two fields, just as read-only text. */
  canEdit: boolean;
};

/** Country + timezone — Task 3 Parts 11/12. A separate section/save from the general project-fields form, matching its own separate, narrower Server Function/authorization. */
export function ProjectLocationSettingsForm({ companyId, projectId, countryCode, timezone, canEdit }: ProjectLocationSettingsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [country, setCountry] = useState(countryCode);
  const [tz, setTz] = useState(timezone);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleSave() {
    setFieldErrors({});
    startTransition(async () => {
      const result = await updateProjectLocationSettings(companyId, projectId, { countryCode: country ?? undefined, timezone: tz ?? undefined });
      if (!result.ok) {
        toast.error(result.error.message);
        setFieldErrors(result.error.fieldErrors ?? {});
        return;
      }
      toast.success("Country/timezone updated.");
    });
  }

  if (!canEdit) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Country</p>
          <p className="text-sm">{countryCode ? countryDisplayName(countryCode as CountryCode) : "Not set"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Timezone</p>
          <p className="text-sm">{timezone ?? "Not set"}</p>
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">Only a Company Admin or Platform Super Admin can change this.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-country">Country</Label>
          <CountryCombobox id="project-country" value={country} onValueChange={setCountry} invalid={Boolean(fieldErrors.countryCode)} disabled={isPending} />
          {fieldErrors.countryCode && <p className="text-sm text-destructive">{fieldErrors.countryCode}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-timezone">Timezone</Label>
          <TimezoneCombobox id="project-timezone" value={tz} onValueChange={setTz} invalid={Boolean(fieldErrors.timezone)} disabled={isPending} />
          {fieldErrors.timezone && <p className="text-sm text-destructive">{fieldErrors.timezone}</p>}
        </div>
      </div>
      <div>
        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={handleSave}>
          {isPending ? <Loader2 className="animate-spin" /> : null}
          {isPending ? "Saving…" : "Save country/timezone"}
        </Button>
      </div>
    </div>
  );
}
