"use client";

import { useSyncExternalStore, useTransition } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { updateAppearance } from "@/modules/appearance/actions";
import { subscribeToAccentTheme, getAccentThemeSnapshot, getAccentThemeServerSnapshot, writeAccentTheme } from "@/modules/appearance/accent-store";
import { THEME_MODES, THEME_MODE_LABELS, ACCENT_THEMES, ACCENT_THEME_LABELS, ACCENT_THEME_SWATCH, type ThemeMode, type AccentTheme } from "@/modules/appearance/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Appearance settings (Phase 18) — Light/Dark/System via next-themes'
 * useTheme() (instant client-side switch, no reload), and one of 5 fixed
 * accent themes (no arbitrary hex input) applied by directly setting the
 * `data-accent-theme` attribute on <html> for instant feedback, then
 * persisted server-side so the next server render (and any other device)
 * picks it up too. See app/layout.tsx's header comment for the full
 * persistence design.
 */
export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const [isPending, startTransition] = useTransition();
  const selectedAccent = useSyncExternalStore(subscribeToAccentTheme, getAccentThemeSnapshot, getAccentThemeServerSnapshot);

  function selectThemeMode(mode: ThemeMode) {
    setTheme(mode);
    startTransition(async () => {
      const result = await updateAppearance({ themeMode: mode });
      if (!result.ok) toast.error(result.error.message);
    });
  }

  function selectAccentTheme(accent: AccentTheme) {
    writeAccentTheme(accent);
    startTransition(async () => {
      const result = await updateAppearance({ accentTheme: accent });
      if (!result.ok) toast.error(result.error.message);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Personal preference — does not affect other users.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Theme</span>
          <div className="flex flex-wrap gap-2">
            {THEME_MODES.map((mode) => (
              <Button key={mode} type="button" variant={theme === mode ? "default" : "outline"} size="sm" onClick={() => selectThemeMode(mode)} disabled={isPending}>
                {THEME_MODE_LABELS[mode]}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Accent color</span>
          <div className="flex flex-wrap gap-2">
            {ACCENT_THEMES.map((accent) => (
              <button
                key={accent}
                type="button"
                onClick={() => selectAccentTheme(accent)}
                disabled={isPending}
                className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted", selectedAccent === accent && "border-primary")}
              >
                <span className="size-4 shrink-0 rounded-full border" style={{ backgroundColor: ACCENT_THEME_SWATCH[accent] }} aria-hidden="true" />
                {ACCENT_THEME_LABELS[accent]}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
