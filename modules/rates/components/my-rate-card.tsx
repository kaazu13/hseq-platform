import Link from "next/link";
import { getFormatter } from "next-intl/server";
import { Wallet } from "lucide-react";
import { RequestRateReviewDialog } from "@/modules/rate-requests/components/request-rate-review-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { MyRateCardData } from "../dashboard-card";

/**
 * Part 4 — a compact PRIVATE card on Your Dashboard. Only ever rendered
 * by the caller when the signed-in user has a linked employee record for
 * this company (dashboard/page.tsx's existing `if (myEmployeeId)` gate —
 * a pure Platform Super Admin/company_admin account with no employee
 * record never reaches this component at all).
 */
export async function MyRateCard({ companyId, data }: { companyId: string; data: MyRateCardData }) {
  const format = await getFormatter();

  if (!data.current) {
    return null; // No rate set yet — nothing private to show, and nothing misleading like "€0.00".
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <Wallet className="size-4 text-muted-foreground" />
        <CardTitle className="text-sm font-medium">My Rate</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <p className="text-2xl font-semibold">
            {format.number(data.current.hourlyRate, { style: "currency", currency: data.current.currency })}
            <span className="ml-1 text-sm font-normal text-muted-foreground">/ hour</span>
          </p>
          <p className="text-xs text-muted-foreground">Effective since {format.dateTime(new Date(`${data.current.effectiveFrom}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Estimated this month</p>
          <p className="text-lg font-semibold">{format.number(data.estimatedThisMonth, { style: "currency", currency: data.currency })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/account/rates" />}>
            View rate history
          </Button>
          <RequestRateReviewDialog companyId={companyId} />
        </div>
      </CardContent>
    </Card>
  );
}
