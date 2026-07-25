import { requireUser } from "@/lib/auth/session";
import { listActiveOrganizationsForUser } from "@/modules/organizations/queries";

/**
 * The one protected page in this milestone. Organization-aware now that
 * the membership schema exists, but still deliberately minimal: it lists
 * the organizations the signed-in user actively belongs to and nothing
 * else. No org switcher, no settings, no member management, no business
 * data — the full organization-management UI is explicitly out of scope
 * for this pass (see the implementation report).
 */
export default async function DashboardPage() {
  const { user } = await requireUser();
  const memberships = await listActiveOrganizationsForUser(user.id);

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="opacity-70">
          Signed in as <span className="font-medium">{user.email}</span>.
        </p>
      </div>

      {memberships.length === 0 ? (
        <div className="max-w-prose rounded-md border border-current/10 p-6">
          <p className="font-medium">You&apos;re not part of an organization yet.</p>
          <p className="mt-2 text-sm opacity-70">
            Organizations are created manually for v1 — see
            supabase/seed.sql for how a Platform Super Admin attaches an
            account to one during development. Once you have an active
            membership, it will show up here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium uppercase tracking-wide opacity-70">
            Your organizations
          </h2>
          <ul className="flex flex-col divide-y divide-current/10 rounded-md border border-current/10">
            {memberships.map(({ membership, organization }) => (
              <li key={membership.id} className="flex items-center justify-between p-4">
                <span className="font-medium">{organization.name}</span>
                <span className="text-sm opacity-70">{organization.slug}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="max-w-prose text-sm opacity-70">
        Projects, employees, and every other module come later. This page
        only proves the database foundation — auth, tenancy, membership,
        and role checks — works end to end.
      </p>
    </div>
  );
}
