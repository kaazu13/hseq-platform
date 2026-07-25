import { redirect } from "next/navigation";

/**
 * Root route. This milestone has nothing to show at "/" yet (no marketing
 * site, no org-aware home). Every visitor is sent to /dashboard, which
 * either renders (if signed in) or bounces to /login via proxy.ts.
 */
export default function Home() {
  redirect("/dashboard");
}
