import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requirePlatformSuperAdmin } from "@/lib/auth/session";
import { listAdminSecurityEvents } from "@/modules/platform-admin/queries";
import { SECURITY_EVENT_TYPE_LABELS } from "@/modules/platform-admin/types";
import { AdminPagination } from "@/modules/platform-admin/components/admin-pagination";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE_SIZE = 50;

function eventTone(eventType: string): "default" | "secondary" | "destructive" {
  if (eventType === "account_banned" || eventType === "login_failed") return "destructive";
  if (eventType === "account_suspended" || eventType === "platform_warning_issued" || eventType === "sessions_revoked") return "secondary";
  return "default";
}

/** Part 2E — platform-wide security/login history: logins, account status changes, and platform warnings all flow through security_events' event_type, so one paginated feed covers all three. */
export default async function PlatformAdminSecurityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePlatformSuperAdmin();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const [{ items, totalCount }, t] = await Promise.all([listAdminSecurityEvents(page, PAGE_SIZE), getTranslations("PlatformAdmin.security")]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/platform-admin/users" />}>
            {t("manageAccounts")}
          </Button>
        }
      />

      {items.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="No security events recorded yet" />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>
                    <Badge variant={eventTone(event.event_type)}>{SECURITY_EVENT_TYPE_LABELS[event.event_type]}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-normal">{event.user_full_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="whitespace-normal">{event.actor_full_name ?? <span className="text-muted-foreground">System</span>}</TableCell>
                  <TableCell className="max-w-xs truncate whitespace-normal">{event.detail ?? "—"}</TableCell>
                  <TableCell>{event.ip_address ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(event.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AdminPagination basePath="/platform-admin/security" page={page} pageSize={PAGE_SIZE} totalCount={totalCount} />
    </div>
  );
}
