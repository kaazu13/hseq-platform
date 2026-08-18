import { getTranslations } from "next-intl/server";
import { requirePlatformSuperAdmin } from "@/lib/auth/session";
import { listAdminAccounts, searchAdminCompanies, getPlatformAccountMemberships, listSecurityEventsForUser, listPlatformWarningsForUser } from "@/modules/platform-admin/queries";
import { ACCOUNT_STATUS_LABELS, SECURITY_EVENT_TYPE_LABELS, MEMBERSHIP_STATUS_LABELS, type MembershipStatus } from "@/modules/platform-admin/types";
import { UserFilters } from "@/modules/platform-admin/components/user-filters";
import { AccountActions } from "@/modules/platform-admin/components/account-actions";
import { AdminPagination } from "@/modules/platform-admin/components/admin-pagination";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users as UsersIcon } from "lucide-react";

const PAGE_SIZE = 25;

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "banned") return "destructive";
  if (status === "suspended") return "secondary";
  return "default";
}

type PageProps = { searchParams: Promise<Record<string, string | undefined>> };

/**
 * Part 2D — Users management. Absorbs the account search/list that used
 * to live directly on /platform-admin (see git history of this file) —
 * that landing page now shows platform-wide aggregate stats instead
 * (2A). Search/filter by name, email, company, role, and account status;
 * "invitation/activation state" doesn't map cleanly onto `profiles` (an
 * invitation, by definition, has no profiles row to filter yet) — pending
 * invitations are managed from each company's detail page instead (2B/2C),
 * which is where they're actually actionable (resend/revoke).
 */
export default async function PlatformAdminUsersPage({ searchParams }: PageProps) {
  await requirePlatformSuperAdmin();
  const params = await searchParams;
  const query = params.q?.trim() || null;
  const accountStatus = (params.status as "active" | "suspended" | "banned" | undefined) || null;
  const companyId = params.companyId || null;
  const roleName = params.role || null;
  const page = Math.max(1, Number(params.page) || 1);
  const expandedUserId = params.view || null;

  const [{ items: accounts, totalCount }, companies, t] = await Promise.all([
    listAdminAccounts({ query, accountStatus, companyId, roleName }, page, PAGE_SIZE),
    searchAdminCompanies(null, 50),
    getTranslations("PlatformAdmin.users"),
  ]);

  let memberships: Awaited<ReturnType<typeof getPlatformAccountMemberships>> = [];
  let securityEvents: Awaited<ReturnType<typeof listSecurityEventsForUser>> = [];
  let warnings: Awaited<ReturnType<typeof listPlatformWarningsForUser>> = [];
  if (expandedUserId) {
    [memberships, securityEvents, warnings] = await Promise.all([
      getPlatformAccountMemberships(expandedUserId),
      listSecurityEventsForUser(expandedUserId, 50),
      listPlatformWarningsForUser(expandedUserId),
    ]);
  }

  const extraParams = { q: query ?? undefined, status: accountStatus ?? undefined, companyId: companyId ?? undefined, role: roleName ?? undefined };
  function expandHref(userId: string): string {
    const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(extraParams).filter(([, v]) => v)), view: userId });
    return `/platform-admin/users?${qs.toString()}`;
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title={t("title")} description={t("description")} />

      <UserFilters companies={companies} />

      {accounts.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No accounts found" />
      ) : (
        <div className="flex flex-col gap-2">
          {accounts.map((account) => (
            <Card key={account.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
                  <a href={expandHref(account.id)} className="hover:underline">
                    {account.full_name} — {account.email}
                  </a>
                  <Badge variant={statusBadgeVariant(account.account_status)}>{ACCOUNT_STATUS_LABELS[account.account_status]}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {account.account_status_reason && <p className="text-sm text-muted-foreground">Reason: {account.account_status_reason}</p>}
                <AccountActions userId={account.id} accountStatus={account.account_status} fullName={account.full_name} />

                {expandedUserId === account.id && (
                  <div className="flex flex-col gap-4 border-t pt-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground uppercase">Memberships &amp; roles</span>
                      {memberships.length === 0 ? (
                        <span className="text-sm text-muted-foreground">No company memberships.</span>
                      ) : (
                        memberships.map((m) => (
                          <span key={m.company_id} className="text-sm">
                            {m.company_name} — {MEMBERSHIP_STATUS_LABELS[m.membership_status as MembershipStatus] ?? m.membership_status} ({(m.role_names ?? []).join(", ") || "no roles"})
                          </span>
                        ))
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground uppercase">Platform warnings</span>
                      {warnings.length === 0 ? (
                        <span className="text-sm text-muted-foreground">None issued.</span>
                      ) : (
                        warnings.map((w) => (
                          <span key={w.id} className="text-sm">
                            {new Date(w.issued_at).toLocaleDateString()} — {w.reason}
                          </span>
                        ))
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground uppercase">Security history</span>
                      {securityEvents.length === 0 ? (
                        <span className="text-sm text-muted-foreground">No recorded events.</span>
                      ) : (
                        securityEvents.map((event) => (
                          <span key={event.id} className="text-sm text-muted-foreground">
                            {new Date(event.created_at).toLocaleString()} — {SECURITY_EVENT_TYPE_LABELS[event.event_type]}
                            {event.ip_address ? ` (${event.ip_address})` : ""}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AdminPagination basePath="/platform-admin/users" page={page} pageSize={PAGE_SIZE} totalCount={totalCount} extraParams={extraParams} />
    </div>
  );
}
