import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { getPublicReport } from "@/modules/reports/queries";
import { PublicReportView } from "@/modules/reports/components/public-report-view";

export const metadata: Metadata = { title: "Shared Report" };

type PageProps = { params: Promise<{ token: string }> };

/**
 * The public, unauthenticated read-only report view. Deliberately outside
 * the (app) route group — it inherits only the minimal root layout, so
 * there is no sidebar, no company/project switcher, and no internal
 * navigation reachable from here. Authorization is entirely the token
 * itself (resolve_public_report()); no session/company/project membership
 * is required or checked.
 */
export default async function PublicSharePage({ params }: PageProps) {
  const { token } = await params;
  const payload = await getPublicReport(token);

  if (!payload) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-8 text-center">
        <ShieldAlert className="size-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">This link is unavailable</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The link may have expired, been revoked, or never existed. Contact whoever shared it with you for a new link.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-muted/30">
      <PublicReportView payload={payload} token={token} />
    </div>
  );
}
