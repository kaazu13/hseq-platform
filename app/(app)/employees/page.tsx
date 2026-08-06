import Link from "next/link";
import { redirect } from "next/navigation";
import { UserPlus, Users } from "lucide-react";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { listEmployees, countEmployees, getEmployeeRoleInfoBulk } from "@/modules/employees/queries";
import { canManageEmployees } from "@/modules/employees/permissions";
import type { EmployeeAccountStatus, EmploymentStatus } from "@/modules/employees/types";
import { clampPage, parsePageParam, parsePageSizeParam, totalPagesFor } from "@/lib/pagination";
import { EmployeeFilters } from "@/modules/employees/components/employee-filters";
import { EmployeeTable } from "@/modules/employees/components/employee-table";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

type EmployeesPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

/**
 * Real employee list, replacing the `ComingSoonPage` placeholder — see
 * docs/PRODUCT_REQUIREMENTS.md, Employee Management Foundation §3.
 * Filters AND pagination come from the URL (modules/employees/components/
 * employee-filters.tsx, components/shared/pagination-bar.tsx), so this
 * Server Component just reads `searchParams`, validates them, and
 * re-queries — there is no client-side fetching involved
 * (docs/API_CONVENTIONS.md §7).
 *
 * `page`/`pageSize` are validated server-side via lib/pagination.ts
 * (never trusted directly from the URL — an invalid/out-of-range value
 * always resolves to something safe) before ever reaching a database
 * query. The total count is fetched first specifically so an
 * out-of-range page (e.g. a bookmarked `?page=9` after filters shrank the
 * result set to 2 pages) can be corrected with a real redirect — the URL
 * and the rendered content never disagree about which page is showing.
 */
export default async function EmployeesPage({ searchParams }: EmployeesPageProps) {
  const params = await searchParams;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="Employees" description="Company employment records for your company." />
        <EmptyState
          icon={Users}
          title="You're not part of an company yet"
          description="Once an administrator adds your account to one, employee records will appear here."
          className="flex-1"
        />
      </div>
    );
  }

  const roleNames = await getUserRoleNames(currentCompanyId);
  const canManage = canManageEmployees(roleNames);

  const filters = {
    search: params.search,
    employmentStatus: params.employmentStatus as EmploymentStatus | "all" | undefined,
    accountStatus: params.accountStatus as EmployeeAccountStatus | "all" | undefined,
    includeArchived: params.includeArchived === "true",
  };

  const requestedPage = parsePageParam(params.page);
  const pageSize = parsePageSizeParam(params.pageSize);

  const totalCount = await countEmployees(currentCompanyId, filters);
  const totalPages = totalPagesFor(totalCount, pageSize);
  const page = clampPage(requestedPage, totalPages);

  if (page !== requestedPage) {
    const corrected = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) corrected.set(key, value);
    }
    corrected.set("page", String(page));
    redirect(`/employees?${corrected.toString()}`);
  }

  const employees = await listEmployees(currentCompanyId, filters, page, pageSize);
  const roleInfoById = await getEmployeeRoleInfoBulk(currentCompanyId, employees);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Employees"
        description="Company employment records for your company."
        actions={
          canManage ? (
            <Button size="sm" nativeButton={false} render={<Link href="/employees/new" />}>
              <UserPlus />
              Add employee
            </Button>
          ) : undefined
        }
      />

      <EmployeeFilters />

      {employees.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No employees found"
          description={
            canManage
              ? "Try a different search or filter, or add your first employee."
              : "Try a different search or filter."
          }
          action={
            canManage ? (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/employees/new" />}>
                <UserPlus />
                Add employee
              </Button>
            ) : undefined
          }
          className="flex-1"
        />
      ) : (
        <>
          <EmployeeTable
            companyId={currentCompanyId}
            employees={employees}
            roleInfoById={roleInfoById}
            canManage={canManage}
            currentUserId={user.id}
          />
          <PaginationBar page={page} pageSize={pageSize} totalCount={totalCount} itemLabel="employees" />
        </>
      )}
    </div>
  );
}
