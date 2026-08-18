import { getTranslations } from "next-intl/server";
import { requirePlatformSuperAdmin } from "@/lib/auth/session";
import { listPlatformSuperAdminRoster } from "@/modules/platform-admin/queries";
import { GrantSuperAdminForm, SuperAdminRosterTable } from "@/modules/platform-admin/components/super-admin-roster";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Part 2 — Platform Settings. Nothing resembling a "platform-wide
 * configuration" concept exists in the schema today (confirmed by
 * inspection — no settings/feature-flags table anywhere) — rather than
 * inventing speculative settings, this page surfaces the one genuinely
 * useful and already-safe thing that had actions but no dedicated UI: the
 * platform_super_admin roster, with grant/revoke
 * (grant_platform_super_admin()/revoke_platform_super_admin(),
 * 20260819095000_platform_admin.sql — both already existed, this page is
 * their missing read/manage surface).
 */
export default async function PlatformAdminSettingsPage() {
  const { user } = await requirePlatformSuperAdmin();
  const [roster, t] = await Promise.all([listPlatformSuperAdminRoster(), getTranslations("PlatformAdmin.settings")]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title={t("title")} description={t("description")} />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t("rosterTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SuperAdminRosterTable roster={roster} currentUserId={user.id} />
        </CardContent>
      </Card>

      <GrantSuperAdminForm />

      <p className="text-xs text-muted-foreground">
        No other platform-wide configuration exists in this schema yet (no feature-flags/settings table). This page intentionally stays minimal rather than inventing speculative settings — a future milestone can extend it
        when a real configurable concept exists.
      </p>
    </div>
  );
}
