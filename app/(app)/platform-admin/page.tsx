import { ShieldAlert } from "lucide-react";
import { requirePlatformSuperAdmin } from "@/lib/auth/session";
import { searchPlatformAccounts, getPlatformAccountMemberships, listSecurityEventsForUser, listPlatformWarningsForUser } from "@/modules/platform-admin/queries";
import { ACCOUNT_STATUS_LABELS, SECURITY_EVENT_TYPE_LABELS } from "@/modules/platform-admin/types";
import { AccountActions } from "@/modules/platform-admin/components/account-actions";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type PlatformAdminPageProps = { searchParams: Promise<Record<string, string | undefined>> };

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "banned") return "destructive";
  if (status === "suspended") return "secondary";
  return "default";
}

/**
 * Platform Administrator console (Phases 12-14) — global, not company-
 * scoped. requirePlatformSuperAdmin() is the real gate; "Inspect the
 * existing platform-level administrator architecture first... Do not
 * confuse: platform administrator / company-level management / project
 * management" — this page is reachable ONLY via platform_super_admins
 * membership, never a company role.
 */
export default async function PlatformAdminPage({ searchParams }: PlatformAdminPageProps) {
  await requirePlatformSuperAdmin();
  const urlParams = await searchParams;
  const query = urlParams.q?.trim() || null;

  const accounts = await searchPlatformAccounts(query, 30);
  const expandedUserId = urlParams.view;

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

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Platform Administration" description="Account and security controls — platform-wide, not scoped to one company." />

      <form action={`/platform-admin`} method="GET" className="flex max-w-sm items-center gap-2">
        <Input name="q" defaultValue={query ?? ""} placeholder="Search by name or email…" />
      </form>

      {accounts.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="No accounts found" />
      ) : (
        <div className="flex flex-col gap-2">
          {accounts.map((account) => (
            <Card key={account.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
                  <a href={`/platform-admin?view=${account.id}${query ? `&q=${encodeURIComponent(query)}` : ""}`} className="hover:underline">
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
                      <span className="text-xs font-medium text-muted-foreground uppercase">Memberships</span>
                      {memberships.length === 0 ? (
                        <span className="text-sm text-muted-foreground">No company memberships.</span>
                      ) : (
                        memberships.map((m) => (
                          <span key={m.company_id} className="text-sm">
                            {m.company_name} — {m.membership_status} ({(m.role_names ?? []).join(", ") || "no roles"})
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
    </div>
  );
}
