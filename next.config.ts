import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Enables the unauthorized()/forbidden() APIs from next/navigation and
    // the app/unauthorized.tsx, app/forbidden.tsx file conventions used by
    // the auth foundation — see docs/ARCHITECTURE.md §5.
    authInterrupts: true,
  },
};

export default nextConfig;
