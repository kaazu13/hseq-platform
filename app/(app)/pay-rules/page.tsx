import Link from "next/link";
import { forbidden } from "next/navigation";
import { getFormatter } from "next-intl/server";
import { Wallet } from "lucide-react";
import { requireUser, getUserRoleNames, isPlatformSuperAdmin } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { canManageEmployeeRates } from "@/modules/rates/permissions";
import { canManagePayRules } from "@/modules/pay-rules/permissions";
import { listEmployeesWithCurrentRate } from "@/modules/rates/queries";
import { listCurrentPayRules } from "@/modules/pay-rules/queries";
import { listCompanyRateRequests } from "@/modules/rate-requests/queries";
import { PAY_RULE_CATEGORIES, PAY_RULE_CATEGORY_LABELS, formatPayRuleValue } from "@/modules/pay-rules/types";
import { SetEmployeeRateDialog } from "@/modules/rates/components/set-employee-rate-dialog";
import { PayRuleEditDialog } from "@/modules/pay-rules/components/pay-rule-edit-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Part 18 — "Rates & Pay Rules": company_admin/planner/platform_super_admin
 * only (canManageEmployeeRates and canManagePayRules share this exact role
 * set — see both permission functions' comments). NOT under Account (that
 * page is the employee's own "My Rate" view); this is the company-wide
 * administration surface, deliberately kept OUT of Equipment/Worked Hours.
 * Three sections over already-built data/actions: Employee Rates (list +
 * set-rate dialog, genuinely new this pass), Rate Requests (a compact
 * pending-count summary linking to the existing dedicated /rate-requests
 * page — never a duplicate second implementation of that whole page), and
 * Pay Rules (one row per category + edit dialog, the core new
 * functionality — Part 10/12).
 */
export default async function PayRulesPage() {
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="Rates & Pay Rules" />
        <EmptyState icon={Wallet} title="No company selected" className="flex-1" />
      </div>
    );
  }

  const [roleNames, isSuperAdmin] = await Promise.all([getUserRoleNames(currentCompanyId), isPlatformSuperAdmin()]);
  const canManageRates = canManageEmployeeRates(roleNames, isSuperAdmin);
  const canManageRules = canManagePayRules(roleNames, isSuperAdmin);
  if (!canManageRates && !canManageRules) forbidden();

  const [employees, payRules, pendingRequests, format] = await Promise.all([
    canManageRates ? listEmployeesWithCurrentRate(currentCompanyId) : Promise.resolve([]),
    canManageRules ? listCurrentPayRules(currentCompanyId) : Promise.resolve([]),
    listCompanyRateRequests(currentCompanyId, { status: "pending" }),
    getFormatter(),
  ]);
  const payRuleByCategory = new Map(payRules.map((rule) => [rule.category, rule]));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-4 sm:p-6">
      <PageHeader title="Rates & Pay Rules" description="Company-wide employee compensation administration." />

      {canManageRates && (
        <div className="flex flex-col gap-3">
          <SectionHeader title="Employee Rates" description="Current hourly rate per employee. Changing a rate never overwrites history — a new effective-dated period starts instead." />
          {employees.length === 0 ? (
            <EmptyState icon={Wallet} title="No active employees" className="flex-1" />
          ) : (
            <div className="flex flex-col divide-y overflow-hidden rounded-lg border">
              {employees.map((employee) => (
                <div key={employee.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium">
                      {employee.firstName} {employee.lastName}
                    </span>
                    <span className="text-xs text-muted-foreground">{employee.positionTitle ?? "—"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                      {employee.currentRate ? `${format.number(employee.currentRate.hourlyRate, { style: "currency", currency: employee.currentRate.currency })}/h since ${format.dateTime(new Date(`${employee.currentRate.effectiveFrom}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })}` : "No rate set"}
                    </span>
                    <SetEmployeeRateDialog
                      companyId={currentCompanyId}
                      employeeId={employee.id}
                      employeeName={`${employee.firstName} ${employee.lastName}`}
                      currentRate={employee.currentRate ? { hourlyRate: employee.currentRate.hourlyRate, currency: employee.currentRate.currency } : null}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <SectionHeader title="Rate Requests" description="Employee rate/salary review requests." />
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <span className="text-sm">
              {pendingRequests.length === 0 ? "No pending requests." : `${pendingRequests.length} pending request${pendingRequests.length === 1 ? "" : "s"}.`}
            </span>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/rate-requests" />}>
              View all requests
            </Button>
          </CardContent>
        </Card>
      </div>

      {canManageRules && (
        <div className="flex flex-col gap-3">
          <SectionHeader title="Pay Rules" description="Premiums applied on top of an employee's base rate, per Worked Hours category (Part 10/12). Amounts are company-configurable, never hard-coded." />
          <div className="flex flex-col divide-y overflow-hidden rounded-lg border">
            {PAY_RULE_CATEGORIES.map((category) => {
              const rule = payRuleByCategory.get(category) ?? null;
              return (
                <div key={category} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium">{PAY_RULE_CATEGORY_LABELS[category]}</span>
                    <span className="text-xs text-muted-foreground">{rule ? formatPayRuleValue(rule) : "Not configured — base rate only"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {category === "sunday" && rule && (
                      <StatusBadge tone={rule.stackable ? "positive" : "neutral"} className="text-xs">
                        {rule.stackable ? "Stacks with other premiums" : "Does not stack"}
                      </StatusBadge>
                    )}
                    <PayRuleEditDialog companyId={currentCompanyId} category={category} currentRule={rule} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
