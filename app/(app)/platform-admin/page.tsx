import Link from "next/link";
import { Ban, Bell, Building2, ClipboardList, FolderKanban, ShieldAlert, ShieldOff, UserCheck, UserX, Users } from "lucide-react";
import { requirePlatformSuperAdmin } from "@/lib/auth/session";
import { getPlatformOverviewStats, listCompaniesWithoutAdmin, listAdminAuditEvents } from "@/modules/platform-admin/queries";
import { AUDIT_ACTION_LABELS, COMPANY_STATUS_LABELS } from "@/modules/platform-admin/types";
import { StatCard } from "@/modules/platform-admin/components/stat-card";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Part 2A — Platform Admin console landing page. Global, never
 * company-scoped (requirePlatformSuperAdmin() is the real gate — see
 * docs/ARCHITECTURE.md's "do not confuse platform administrator /
 * company-level management / project management"). Every number here
 * comes from platform_admin_get_overview_stats(), a single bounded
 * round trip of COUNT(*) queries — no unbounded row scan.
 */
export default async function PlatformAdminOverviewPage() {
  await requirePlatformSuperAdmin();

  const [stats, companiesWithoutAdmin, recentAudit] = await Promise.all([
    getPlatformOverviewStats(),
    listCompaniesWithoutAdmin(10),
    listAdminAuditEvents({}, 1, 10),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Platform Administration" description="Platform-wide operator console — global, not scoped to any one company." />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Active companies" value={stats.active_companies} icon={Building2} />
        <StatCard label="Trial / Suspended companies" value={stats.trial_companies + stats.suspended_companies} icon={Building2} hint={`${stats.trial_companies} trial, ${stats.suspended_companies} suspended`} />
        <StatCard label="Active projects" value={stats.active_projects} icon={FolderKanban} />
        <StatCard label="Employee records" value={stats.total_employees} icon={ClipboardList} hint={`${stats.active_employees} active`} />
        <StatCard label="Activated users" value={stats.activated_users} icon={UserCheck} hint="Accounts with a real login" />
        <StatCard label="Pending invitations" value={stats.pending_invitations} icon={Bell} />
        <StatCard label="Suspended accounts" value={stats.suspended_accounts} icon={UserX} tone={stats.suspended_accounts > 0 ? "warning" : "default"} />
        <StatCard label="Banned accounts" value={stats.banned_accounts} icon={Ban} tone={stats.banned_accounts > 0 ? "danger" : "default"} />
        <StatCard label="Active platform warnings" value={stats.active_platform_warnings} icon={ShieldAlert} tone={stats.active_platform_warnings > 0 ? "warning" : "default"} />
        <StatCard label="Companies without an admin" value={stats.companies_without_admin_count} icon={ShieldOff} tone={stats.companies_without_admin_count > 0 ? "warning" : "default"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-sm font-medium">
            <span>Companies with no company administrator</span>
            <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/platform-admin/companies" />}>
              View all companies
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {companiesWithoutAdmin.length === 0 ? (
            <EmptyState icon={Users} title="Every company has an administrator" description="No further action needed here." />
          ) : (
            <div className="flex flex-col gap-2">
              {companiesWithoutAdmin.map((company) => (
                <div key={company.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{company.name}</span>
                    <Badge variant="outline">{COMPANY_STATUS_LABELS[company.status]}</Badge>
                  </div>
                  <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/platform-admin/companies/${company.id}`} />}>
                    Assign administrator
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-sm font-medium">
            <span>Recent platform activity</span>
            <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/platform-admin/audit" />}>
              View full audit log
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentAudit.items.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No recorded activity yet" />
          ) : (
            <div className="flex flex-col gap-2">
              {recentAudit.items.map((event) => (
                <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm last:border-b-0 last:pb-0">
                  <span>
                    <span className="font-medium">{event.actor_full_name ?? "System"}</span> {AUDIT_ACTION_LABELS[event.action].toLowerCase()} {event.entity_type.replace(/_/g, " ")}
                    {event.company_name ? ` in ${event.company_name}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
