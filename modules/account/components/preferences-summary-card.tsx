"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { subscribeToAccentTheme, getAccentThemeSnapshot, getAccentThemeServerSnapshot } from "@/modules/appearance/accent-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type PreferencesSummaryCardProps = {
  /** Already-resolved display name for the current locale (e.g. "Español") — locale itself is a server-resolved value, not client state. */
  languageName: string;
};

/**
 * Account redesign (Section 9) — a compact read-only summary + a link into
 * Settings, not a duplicate of the full Appearance/Language sections.
 * Theme mode and accent color are read from the SAME client state
 * Settings' AppearanceSection uses (next-themes' useTheme() + the accent
 * store) rather than a fresh DB read, so this card is always in sync with
 * whatever the user just changed, on this device, without a page reload.
 */
export function PreferencesSummaryCard({ languageName }: PreferencesSummaryCardProps) {
  const t = useTranslations("Account");
  const tAppearance = useTranslations("Appearance");
  const { theme } = useTheme();
  const accent = useSyncExternalStore(subscribeToAccentTheme, getAccentThemeSnapshot, getAccentThemeServerSnapshot);

  const themeLabel = theme ? tAppearance(`themeMode.${theme}` as "themeMode.light" | "themeMode.dark" | "themeMode.system") : null;
  const accentLabel = tAppearance(`accent.${accent}` as "accent.default_blue");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("preferences")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">{t("language")}</dt>
            <dd className="text-sm font-medium">{languageName}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("theme")}</dt>
            <dd className="text-sm font-medium">{themeLabel ?? t("notAvailable")}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("accentColor")}</dt>
            <dd className="text-sm font-medium">{accentLabel}</dd>
          </div>
        </dl>
        <Button variant="outline" size="sm" className="self-start" nativeButton={false} render={<Link href="/settings" />}>
          {t("openSettings")}
          <ChevronRight />
        </Button>
      </CardContent>
    </Card>
  );
}
