import { getRequestConfig } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_LOCALE, isSupportedLocale } from "./locale";

/**
 * Task 3 Part 21 — "without i18n routing" mode: no `/en/...`/`/es/...` URL
 * prefixes (this app's ~35 route segments were never built with a locale
 * segment, and retrofitting one would be an enormous, unrelated routing
 * migration). The locale is resolved from the SIGNED-IN user's own saved
 * `profiles.locale` (Part 22's language selector writes it, via the exact
 * same self-only, server-persisted-preference pattern Part 20 already
 * established for theme_mode/accent_theme) — never from the URL, a cookie,
 * or the browser's Accept-Language header. A signed-out visitor (login,
 * signup) gets DEFAULT_LOCALE; that surface is intentionally out of this
 * pass's extraction scope (see the Part 46 final report).
 */
export default getRequestConfig(async () => {
  const user = await getCurrentUser();
  let locale = DEFAULT_LOCALE;

  if (user) {
    const supabase = await createClient();
    const { data: profile } = await supabase.from("profiles").select("locale").eq("id", user.id).maybeSingle();
    if (profile && isSupportedLocale(profile.locale)) {
      locale = profile.locale;
    }
  }

  const messages = (await import(`../messages/${locale}.json`)).default;

  return { locale, messages };
});
