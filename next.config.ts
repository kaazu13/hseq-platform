import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  experimental: {
    // Enables the unauthorized()/forbidden() APIs from next/navigation and
    // the app/unauthorized.tsx, app/forbidden.tsx file conventions used by
    // the auth foundation — see docs/ARCHITECTURE.md §5.
    authInterrupts: true,
  },
};

// Task 3 Part 21 — points at i18n/request.ts, which resolves the locale
// from the signed-in user's own saved profiles.locale (never from the URL
// — this app has no locale-prefixed routing; see that file's own header
// comment for why "without i18n routing" is the right mode here).
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
