import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "HSEQ Platform",
    template: "%s — HSEQ Platform",
  },
  description: "Multi-tenant HSEQ and construction operations platform.",
};

/**
 * Appearance (Phase 18) — Light/Dark/System is handled by next-themes
 * (`attribute="class"`, its own standard localStorage persistence +
 * blocking inline script, so switching between mode is instant and never
 * flashes the wrong theme). The accent theme has no "system" concept, so
 * it doesn't need next-themes' client machinery at all: its
 * `data-accent-theme` value is resolved HERE, server-side, from the
 * signed-in user's saved `profiles.accent_theme` (falling back to
 * 'default_blue' — the plain :root/.dark tokens — for a signed-out
 * visitor or one with no saved preference), and baked directly into the
 * server-rendered `<html>` tag. There is no flash-of-wrong-accent because
 * there is no client-side accent resolution step at all.
 *
 * `theme_mode` is ALSO read here and passed as next-themes'
 * `defaultTheme`, so a brand-new browser/device (no localStorage entry
 * yet) still seeds from the user's saved preference on its very first
 * paint; every subsequent visit from that same browser is governed by
 * next-themes' own localStorage value once the user has toggled it there
 * (a deliberate, disclosed accepted limitation — this app has no reason
 * to fight next-themes' own well-tested persistence for the mode it's
 * actually designed to own).
 */
export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await getCurrentUser();
  let accentTheme = "default_blue";
  let themeMode = "system";
  if (user) {
    const supabase = await createClient();
    const { data: profile } = await supabase.from("profiles").select("theme_mode, accent_theme").eq("id", user.id).maybeSingle();
    if (profile) {
      accentTheme = profile.accent_theme;
      themeMode = profile.theme_mode;
    }
  }

  // Task 3 Part 21 — locale/messages come from i18n/request.ts (resolved
  // from the same signed-in-user's saved profiles.locale, "without i18n
  // routing" mode — see that file's header comment). NextIntlClientProvider
  // makes both available to Client Components (useTranslations()); Server
  // Components use getTranslations() directly, no provider needed for them.
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <html
      lang={locale}
      data-accent-theme={accentTheme}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider attribute="class" defaultTheme={themeMode} enableSystem disableTransitionOnChange>
            <TooltipProvider delay={200}>
              {children}
              <Toaster />
            </TooltipProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
