import Link from "next/link";
import { CreditCard, Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requirePlatformSuperAdmin } from "@/lib/auth/session";
import { listAdminCompanies } from "@/modules/platform-admin/queries";
import { COMPANY_SUBSCRIPTION_STATUS_LABELS } from "@/modules/platform-admin/types";
import { BillingEditDialog } from "@/modules/platform-admin/components/billing-edit-dialog";
import { AdminPagination } from "@/modules/platform-admin/components/admin-pagination";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE_SIZE = 20;

/** Part 9 foundation, Part 2 UI — cross-company billing/usage view. Reuses platform_admin_list_companies (already selects plan/status/limits alongside its usage aggregates) rather than a separate RPC. No payment processing anywhere in this console. */
export default async function PlatformAdminBillingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePlatformSuperAdmin();
  const params = await searchParams;
  const query = params.q?.trim() || null;
  const page = Math.max(1, Number(params.page) || 1);

  const [{ items, totalCount }, t] = await Promise.all([listAdminCompanies(query, page, PAGE_SIZE), getTranslations("PlatformAdmin.billing")]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title={t("title")} description={t("description")} />

      <form action="/platform-admin/billing" method="GET" className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input name="q" defaultValue={query ?? ""} placeholder="Search by name…" className="pl-8" />
      </form>

      {items.length === 0 ? (
        <EmptyState icon={CreditCard} title="No companies found" />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Employees</TableHead>
                <TableHead>Projects</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((company) => (
                <TableRow key={company.id}>
                  <TableCell className="font-medium whitespace-normal">
                    <Link href={`/platform-admin/companies/${company.id}`} className="hover:underline">
                      {company.name}
                    </Link>
                  </TableCell>
                  <TableCell>{company.subscription_plan_name ?? <span className="text-muted-foreground">No plan set</span>}</TableCell>
                  <TableCell>{company.subscription_status ? <Badge variant="outline">{COMPANY_SUBSCRIPTION_STATUS_LABELS[company.subscription_status]}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    {company.active_employee_count} / {company.employee_limit ?? "no limit"}
                  </TableCell>
                  <TableCell>
                    {company.active_project_count} / {company.project_limit ?? "no limit"}
                  </TableCell>
                  <TableCell>
                    <BillingEditDialog
                      companyId={company.id}
                      companyName={company.name}
                      current={{ planName: company.subscription_plan_name, status: company.subscription_status, employeeLimit: company.employee_limit, projectLimit: company.project_limit }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AdminPagination basePath="/platform-admin/billing" page={page} pageSize={PAGE_SIZE} totalCount={totalCount} extraParams={{ q: query ?? undefined }} />
    </div>
  );
}
