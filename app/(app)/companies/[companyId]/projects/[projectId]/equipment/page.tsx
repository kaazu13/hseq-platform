import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Download, Wrench } from "lucide-react";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames, isEmployeeOnlyAccount, isPlatformSuperAdmin } from "@/lib/auth/session";
import { getProject, getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { getMyEmployeeId } from "@/modules/daily-workforce/queries";
import { canManageEquipment } from "@/modules/equipment/permissions";
import {
  listEquipmentItems,
  countEquipmentItems,
  listEquipmentCategories,
  listEquipmentCandidateItems,
  listEquipmentCandidateEmployees,
  listEquipmentAssignments,
  listEquipmentRequests,
  listEquipmentHistory,
  getEquipmentItem,
  type EquipmentItemListFilters,
} from "@/modules/equipment/queries";
import { toEmployeeOptions } from "@/modules/employees/employee-options";
import { parsePageParam, parsePageSizeParam } from "@/lib/pagination";
import { AddEditEquipmentItemDialog } from "@/modules/equipment/components/add-edit-equipment-item-dialog";
import { EquipmentInventoryFilters } from "@/modules/equipment/components/equipment-inventory-filters";
import { EquipmentInventoryView } from "@/modules/equipment/components/equipment-inventory-view";
import { EquipmentIssuedView } from "@/modules/equipment/components/equipment-issued-view";
import { EquipmentRequestsReview } from "@/modules/equipment/components/equipment-requests-review";
import { EquipmentHistoryView } from "@/modules/equipment/components/equipment-history-view";
import { PageHeader } from "@/components/shared/page-header";
import { RefreshButton } from "@/components/shared/refresh-button";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EquipmentPageProps = {
  params: Promise<{ companyId: string; projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

const TABS = [
  { key: "inventory", label: "Inventory" },
  { key: "issued", label: "Issued" },
  { key: "requests", label: "Requests" },
  { key: "history", label: "History" },
] as const;

/**
 * Equipment V2 (items 3-4) — the real management page, replacing the
 * ComingSoonPage placeholder. Company/project context comes entirely from
 * the URL's own params (re-verified server-side, same authorization chain
 * as every other canonical route in this tree) — no internal project
 * selector, matching item 3's explicit "the top-level app-shell selector
 * remains the operational context" rule.
 */
export default async function EquipmentPage({ params, searchParams }: EquipmentPageProps) {
  const { companyId, projectId } = await params;
  const urlParams = await searchParams;
  const { user } = await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const project = await getProject(companyId, projectId);
  if (!project) {
    notFound();
  }

  const [roleNames, myProjectAssignmentRoles, myEmployeeId, isSuperAdmin] = await Promise.all([
    getUserRoleNames(companyId),
    getMyProjectAssignmentRoles(companyId, projectId, user.id),
    getMyEmployeeId(companyId, user.id),
    isPlatformSuperAdmin(),
  ]);

  // Employee-role correction: this is the management inventory/issue/
  // admin surface — a plain Employee gets the personal "My Equipment"
  // page instead (own assignments/requests only). Redirected (not just
  // hidden from the nav) so direct URL entry lands somewhere useful
  // rather than a bare denial.
  if (isEmployeeOnlyAccount(roleNames)) {
    redirect("/my-equipment");
  }

  // Part 9: platform_super_admin has global equipment authority — same OR
  // treatment as every other manage-tier check in this domain.
  const canManage = isSuperAdmin || canManageEquipment(roleNames, projectId, myProjectAssignmentRoles);

  const basePath = `/companies/${companyId}/projects/${projectId}/equipment`;
  const tab = TABS.some((t) => t.key === urlParams.tab) ? urlParams.tab! : "inventory";

  function tabHref(key: string): string {
    return `${basePath}?tab=${key}`;
  }

  let body: React.ReactNode = null;

  if (tab === "inventory") {
    const filters: EquipmentItemListFilters = {
      search: urlParams.search,
      category: urlParams.category,
      status: urlParams.status as EquipmentItemListFilters["status"],
      condition: urlParams.condition as EquipmentItemListFilters["condition"],
      ownership: (urlParams.ownership as EquipmentItemListFilters["ownership"]) ?? "all",
    };
    const page = parsePageParam(urlParams.page);
    const pageSize = parsePageSizeParam(urlParams.pageSize);

    const [items, totalCount, categories, candidateItems, candidateEmployeeRows] = await Promise.all([
      listEquipmentItems(companyId, projectId, filters, page, pageSize),
      countEquipmentItems(companyId, projectId, filters),
      listEquipmentCategories(companyId),
      listEquipmentCandidateItems(companyId, projectId),
      canManage ? listEquipmentCandidateEmployees(companyId, projectId) : Promise.resolve([]),
    ]);
    const employees = toEmployeeOptions(candidateEmployeeRows);

    body = (
      <div className="flex flex-col gap-4">
        <EquipmentInventoryFilters categories={categories} projectName={project.name} />
        <EquipmentInventoryView
          companyId={companyId}
          projectId={projectId}
          projectName={project.name}
          items={items}
          candidateItems={candidateItems}
          employees={employees}
          canManage={canManage}
          basePath={basePath}
        />
        <PaginationBar page={page} pageSize={pageSize} totalCount={totalCount} itemLabel="items" />
      </div>
    );
  } else if (tab === "issued") {
    const expiryFilter = urlParams.expiry === "expiring_soon" || urlParams.expiry === "expired" ? urlParams.expiry : "all";
    const assignments = await listEquipmentAssignments(companyId, projectId, { expiry: expiryFilter });
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: "all", label: "All" },
              { key: "expiring_soon", label: "Expiring soon" },
              { key: "expired", label: "Expired" },
            ] as const
          ).map((option) => (
            <Link
              key={option.key}
              href={option.key === "all" ? tabHref("issued") : `${tabHref("issued")}&expiry=${option.key}`}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                expiryFilter === option.key ? "border-primary bg-primary/10 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </Link>
          ))}
        </div>
        <EquipmentIssuedView companyId={companyId} projectId={projectId} assignments={assignments} canManage={canManage} />
      </div>
    );
  } else if (tab === "requests") {
    if (!canManage) {
      body = <p className="text-sm text-muted-foreground">You don&apos;t have access to review equipment requests for this project.</p>;
    } else {
      const [requests, candidateItems, candidateEmployeeRows] = await Promise.all([
        listEquipmentRequests(companyId, projectId),
        listEquipmentCandidateItems(companyId, projectId),
        listEquipmentCandidateEmployees(companyId, projectId),
      ]);
      body = <EquipmentRequestsReview companyId={companyId} projectId={projectId} requests={requests} candidateItems={candidateItems} employees={toEmployeeOptions(candidateEmployeeRows)} />;
    }
  } else if (tab === "history") {
    const itemId = urlParams.itemId;
    const item = itemId ? await getEquipmentItem(companyId, itemId) : null;
    const entries = item ? await listEquipmentHistory(companyId, item.id) : [];
    body = <EquipmentHistoryView itemName={item?.name ?? null} entries={entries} />;
  }

  const exportType = tab === "issued" ? "issued" : tab === "requests" ? "requests" : tab === "history" ? "history" : "inventory";
  const exportHref = `${basePath}/export?type=${exportType}${tab === "history" && urlParams.itemId ? `&itemId=${urlParams.itemId}` : ""}`;
  const canExport = canManage && (tab !== "history" || Boolean(urlParams.itemId));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Equipment"
        description={project.name}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton />
            {canExport && (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={exportHref} />} className="print:hidden">
                <Download />
                Export
              </Button>
            )}
            {canManage && tab === "inventory" && <AddEditEquipmentItemDialog companyId={companyId} projectId={projectId} projectName={project.name} />}
          </div>
        }
      />

      <div className="flex flex-wrap gap-1 border-b">
        {TABS.filter((t) => t.key !== "requests" || canManage).map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {myEmployeeId === null && !canManage && (
        <p className="text-sm text-muted-foreground">
          No employee record is linked to your account for this company —{" "}
          <span className="inline-flex items-center gap-1">
            <Wrench className="size-3.5" />
            contact your administrator.
          </span>
        </p>
      )}

      {body}
    </div>
  );
}
