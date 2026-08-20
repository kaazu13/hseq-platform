import { Wallet } from "lucide-react";
import { getTranslations, getFormatter } from "next-intl/server";
import { requireUser } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getMyEmployeeId } from "@/modules/daily-workforce/queries";
import { listEmployeeRateHistory } from "@/modules/rates/queries";
import { AccountSubnav } from "@/modules/account/components/account-subnav";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Part 17/18 — Account > Rates. Own rate/history ONLY (RLS on
 * employee_hourly_rates already backstops this — an employee can only
 * ever see their own row — this page's employeeId is always the caller's
 * own, never a URL param, so there's no cross-employee lookup surface
 * here at all).
 */
export default async function AccountRatesPage() {
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);
  const [t, format] = await Promise.all([getTranslations("Account"), getFormatter()]);

  if (!currentCompanyId) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title={t("tabRates")} />
        <EmptyState icon={Wallet} title={t("noCompanyTitle")} description={t("noCompanyDescription")} className="flex-1" />
      </div>
    );
  }

  const myEmployeeId = await getMyEmployeeId(currentCompanyId, user.id);
  if (!myEmployeeId) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title={t("tabRates")} description={t("description")} />
        <AccountSubnav active="rates" showRates={false} />
        <EmptyState icon={Wallet} title={t("noEmployeeRecordTitle")} description={t("noEmployeeRecordDescription")} className="flex-1" />
      </div>
    );
  }

  const history = await listEmployeeRateHistory(currentCompanyId, myEmployeeId);
  const current = history.find((entry) => entry.effectiveTo === null);
  const previous = history.filter((entry) => entry.effectiveTo !== null);

  function formatRate(hourlyRate: number, currency: string) {
    return format.number(hourlyRate, { style: "currency", currency });
  }

  function formatDate(value: string) {
    return format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title={t("tabRates")} description={t("ratesDescription")} />
      <AccountSubnav active="rates" showRates={true} />

      {!current && previous.length === 0 ? (
        <EmptyState icon={Wallet} title={t("noRateSetTitle")} description={t("noRateSetDescription")} className="flex-1" />
      ) : (
        <div className="flex flex-col gap-6">
          {current && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">{t("currentRate")}</h2>
              <Card>
                <CardContent className="flex items-baseline justify-between py-4">
                  <span className="text-2xl font-semibold">
                    {formatRate(current.hourlyRate, current.currency)}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">{t("perHour")}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{t("effectiveFrom", { date: formatDate(current.effectiveFrom) })}</span>
                </CardContent>
              </Card>
            </div>
          )}

          {previous.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">{t("previousRates")}</h2>
              <div className="flex flex-col gap-1.5">
                {previous.map((entry) => (
                  <Card key={entry.id}>
                    <CardContent className="flex items-baseline justify-between py-3">
                      <span className="font-medium">
                        {formatRate(entry.hourlyRate, entry.currency)}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">{t("perHour")}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(entry.effectiveFrom)} – {entry.effectiveTo ? formatDate(entry.effectiveTo) : ""}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
