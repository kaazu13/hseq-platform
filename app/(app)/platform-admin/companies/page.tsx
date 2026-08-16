import Link from "next/link";
import { Building2, Search } from "lucide-react";
import { requirePlatformSuperAdmin } from "@/lib/auth/session";
import { listAdminCompanies } from "@/modules/platform-admin/queries";
import { COMPANY_STATUS_LABELS } from "@/modules/platform-admin/types";
import { AdminPagination } from "@/modules/platform-admin/components/admin-pagination";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE_SIZE = 20;

function companyStatusVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "suspended") return "destructive";
  if (status === "trial") return "secondary";
  return "default";
}

/** Part 2B — every company on the platform, searchable/sortable-by-name, URL-param-driven pagination (mirrors modules/lmra/components/lmra-filters.tsx's convention). */
export default async function PlatformAdminCompaniesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePlatformSuperAdmin();
  const params = await searchParams;
  const query = params.q?.trim() || null;
  const page = Math.max(1, Number(params.page) || 1);

  const { items, totalCount } = await listAdminCompanies(query, page, PAGE_SIZE);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Companies"
        description="Every tenant on the platform — status, usage, administrators, invitations, and subscription."
        actions={
          <Button size="sm" nativeButton={false} render={<Link href="/platform-admin/companies/new" />}>
            <Building2 />
            Create company
          </Button>
        }
      />

      <form action="/platform-admin/companies" method="GET" className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input name="q" defaultValue={query ?? ""} placeholder="Search by name or slug…" className="pl-8" />
      </form>

      {items.length === 0 ? (
        <EmptyState icon={Building2} title="No companies found" />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Employees</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Projects</TableHead>
                <TableHead>Administrators</TableHead>
                <TableHead>Invitations</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((company) => (
                <TableRow key={company.id}>
                  <TableCell className="font-medium whitespace-normal">{company.name}</TableCell>
                  <TableCell>
                    <Badge variant={companyStatusVariant(company.status)}>{COMPANY_STATUS_LABELS[company.status]}</Badge>
                  </TableCell>
                  <TableCell>{company.active_employee_count}</TableCell>
                  <TableCell>{company.activated_user_count}</TableCell>
                  <TableCell>{company.active_project_count}</TableCell>
                  <TableCell className="whitespace-normal">
                    {company.admin_names.length === 0 ? (
                      <Badge variant="outline" className="text-amber-600 dark:text-amber-500">
                        No admin
                      </Badge>
                    ) : (
                      company.admin_names.join(", ")
                    )}
                  </TableCell>
                  <TableCell>{company.pending_invitation_count}</TableCell>
                  <TableCell>{company.subscription_plan_name ?? <span className="text-muted-foreground">No plan set</span>}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/platform-admin/companies/${company.id}`} />}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AdminPagination basePath="/platform-admin/companies" page={page} pageSize={PAGE_SIZE} totalCount={totalCount} extraParams={{ q: query ?? undefined }} />
    </div>
  );
}
