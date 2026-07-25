import { requireUser } from "@/lib/auth/session";

/**
 * The one protected page in this milestone. Deliberately minimal — no
 * organization/role context, no business data — since employees, projects,
 * and every other business module are explicitly out of scope for this
 * pass. Its only job is to prove the auth foundation end-to-end: an
 * unauthenticated visitor cannot reach this page, and an authenticated one
 * sees their own identity reflected back.
 */
export default async function DashboardPage() {
  const { user } = await requireUser();

  return (
    <div className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="opacity-70">
        Signed in as <span className="font-medium">{user.email}</span>.
      </p>
      <p className="max-w-prose text-sm opacity-70">
        This page only proves the authentication foundation works. Projects,
        employees, and every other module come later, once the
        organization/role schema in docs/DATABASE_SCHEMA.md is in place.
      </p>
    </div>
  );
}
