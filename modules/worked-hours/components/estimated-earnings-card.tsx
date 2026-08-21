import { getTranslations, getFormatter } from "next-intl/server";
import type { EstimatedEarnings } from "@/modules/pay-rules/earnings";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Parts 14/17 — labeled "Estimated earnings," explicitly never "Final
 * salary"/"Payroll," with the required disclaimer note. Never includes
 * taxes/social contributions (this engine never calculates them at all).
 */
export async function EstimatedEarningsCard({ earnings }: { earnings: Omit<EstimatedEarnings, "lineItems"> }) {
  const [t, format] = await Promise.all([getTranslations("MyHours"), getFormatter()]);

  function money(value: number) {
    return format.number(value, { style: "currency", currency: earnings.currency });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-4">
        <h3 className="text-sm font-semibold">{t("estimatedEarnings")}</h3>
        <div className="flex flex-col gap-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("basePay")}</span>
            <span className="tabular-nums">{money(earnings.basePayTotal)}</span>
          </div>
          {earnings.categoryPremiumTotal > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("premiums")}</span>
              <span className="tabular-nums">{money(earnings.categoryPremiumTotal)}</span>
            </div>
          )}
          {earnings.sundayPremiumTotal > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("sundayPremium")}</span>
              <span className="tabular-nums">{money(earnings.sundayPremiumTotal)}</span>
            </div>
          )}
          <div className="flex items-center justify-between border-t pt-1 font-semibold">
            <span>{t("estimatedTotal")}</span>
            <span className="tabular-nums">{money(earnings.total)}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("earningsEstimateNote")}</p>
      </CardContent>
    </Card>
  );
}
