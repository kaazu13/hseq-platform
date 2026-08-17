"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateLocale } from "@/modules/locale-preference/actions";
import { LOCALES, LOCALE_NATIVE_NAMES, type Locale } from "@/i18n/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type LanguageRegionSectionProps = {
  currentLocale: Locale;
};

/**
 * Task 3 Parts 21/22/25/27 — the language selector (Settings' "Language &
 * Region" section), plus a live preview demonstrating real ICU
 * pluralization/interpolation (unreadNotifications, ICU plural rules
 * differ per locale — see messages/*.json) and locale-aware date/number
 * formatting (previewDate/previewNumber use the message catalog's own
 * `{date, date, long}`/`{value, number}` ICU format specifiers, resolved
 * via the CURRENT locale's Intl formatting conventions) — deliberately
 * distinct from project-timezone-controlled operational time (Part
 * 11/15's ProjectClock/getProjectLocalDate): this is about how a date/
 * number LOOKS (DD/MM/YYYY vs MM/DD/YYYY, decimal comma vs period), not
 * WHAT moment/day it actually is.
 */
export function LanguageRegionSection({ currentLocale }: LanguageRegionSectionProps) {
  const t = useTranslations("LanguageRegion");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [locale, setLocale] = useState<Locale>(currentLocale);

  function handleChange(next: string | null) {
    if (!next || !(LOCALES as readonly string[]).includes(next)) return;
    const nextLocale = next as Locale;
    setLocale(nextLocale);
    startTransition(async () => {
      const result = await updateLocale({ locale: nextLocale });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(t("saved"));
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor="locale-select">{t("languageLabel")}</Label>
          <Select value={locale} onValueChange={handleChange} disabled={isPending}>
            <SelectTrigger id="locale-select" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCALES.map((value) => (
                <SelectItem key={value} value={value}>
                  {LOCALE_NATIVE_NAMES[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <span>{t("previewDate", { date: new Date() })}</span>
          <span>{t("previewNumber", { value: 1234.5 })}</span>
          <span>{t("unreadNotifications", { count: 3 })}</span>
        </div>
      </CardContent>
    </Card>
  );
}
