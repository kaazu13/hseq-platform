import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Download, Wrench } from "lucide-react";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames, isEmployeeOrInspectorOnlyAccount, isPlatformSuperAdmin } from "@/lib/auth/session";
import { getProject, getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { getMyEmployeeId } from "@/modules/daily-workforce/queries";
import { canManageEquipment, canManageEquipmentCatalog } from "@/modules/equipment/permissions";
import {
  listEquipmentItems,
  countEquipmentItems,
  listEquipmentCategories,
  listEquipmentCandidateItems,
  listEquipmentCandidateEmployees,
  listEquipmentAssignments,
  listEquipmentRequests,
  listEquipmentHistory,
  listEquipmentHistoryForProject,
  getEquipmentItem,
  getEquipmentOverviewMetrics,
  type EquipmentItemListFilters,
  type EquipmentHistoryListFilters,
} from "@/modules/equipment/queries";
import type { EquipmentHistoryEvent } from "@/modules/equipment/types";
import { toEmployeeOptions } from "@/modules/employees/employee-options";
import { parsePageParam, parsePageSizeParam } from "@/lib/pagination";
import { AddEditEquipmentItemDialog } from "@/modules/equipment/components/add-edit-equipment-item-dialog";
import { EquipmentInventoryFilters } from "@/modules/equipment/components/equipment-inventory-filters";
import { EquipmentInventoryView } from "@/modules/equipment/components/equipment-inventory-view";
import { EquipmentCatalogView } from "@/modules/equipment/components/equipment-catalog-view";
import { EquipmentOverview } from "@/modules/equipment/components/equipment-overview";
import { EquipmentIssuedView } from "@/modules/equipment/components/equipment-issued-view";
import { EquipmentRequestsReview } from "@/modules/equipment/components/equipment-requests-review";
import { EquipmentHistoryView } from "@/modules/equipment/components/equipment-history-view";
import { EquipmentHistoryFilters } from "@/modules/equipment/components/equipment-history-filters";
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
  { key: "overview", label: "Overview" },
  { key: "catalog", label: "Catalog" },
  { key: "inventory", label: "Inventory" },
  { key: "issued", label: "Issued" },
  { key: "requests", label: "Requests" },
  { key: "expiring", label: "Expiring" },
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

  // Employee-role correction + Inspector role correction (Part D): this
  // is the management inventory/issue/admin surface — a plain Employee OR
  // a plain Inspector gets the personal "My Equipment" page instead (own
  // assignments/requests only). Redirected (not just hidden from the
  // nav) so direct URL entry lands somewhere useful rather than a bare
  // denial. An Inspector who ALSO holds a genuine management role is
  // unaffected (isEmployeeOrInspectorOnlyAccount never wrongly narrows a
  // multi-role account).
  if (isEmployeeOrInspectorOnlyAccount(roleNames)) {
    redirect("/my-equipment");
  }

  // Part 9: platform_super_admin has global equipment authority — same OR
  // treatment as every other manage-tier check in this domain.
  const canManage = isSuperAdmin || canManageEquipment(roleNames, projectId, myProjectAssignmentRoles);
  // Part 24/33 — the wider catalog/pricing/stock tier (adds `planner`,
  // never issuing/request-decision authority). Gates the Catalog tab and
  // is a strict superset of canManage, so every full manager sees it too.
  const canManageCatalog = isSuperAdmin || canManageEquipmentCatalog(roleNames, projectId, myProjectAssignmentRoles);

  const basePath = `/companies/${companyId}/projects/${projectId}/equipment`;
  const tab = TABS.some((t) => t.key === urlParams.tab) ? urlParams.tab! : "inventory";
  const tr = await getTranslations("Equipment");

  function tabHref(key: string): string {
    return `${basePath}?tab=${key}`;
  }

  let body: React.ReactNode = null;
  const hasAnyManageAccess = canManage || canManageCatalog;

  if (tab === "overview") {
    if (!canManage) {
      body = <p className="text-sm text-muted-foreground">{tr("noAccessToOverview")}</p>;
    } else {
      const metrics = await getEquipmentOverviewMetrics(companyId, projectId);
      body = <EquipmentOverview metrics={metrics} />;
    }
  } else if (tab === "catalog") {
    if (!canManageCatalog) {
      body = <p className="text-sm text-muted-foreground">{tr("noAccessToCatalog")}</p>;
    } else {
      const filters: EquipmentItemListFilters = {
        search: urlParams.search,
        category: urlParams.category,
        ownership: (urlParams.ownership as EquipmentItemListFilters["ownership"]) ?? "all",
      };
      const page = parsePageParam(urlParams.page);
      const pageSize = parsePageSizeParam(urlParams.pageSize);
      const [items, totalCount, categories] = await Promise.all([
        listEquipmentItems(companyId, projectId, filters, page, pageSize),
        countEquipmentItems(companyId, projectId, filters),
        listEquipmentCategories(companyId),
      ]);
      body = (
        <div className="flex flex-col gap-4">
          <EquipmentInventoryFilters categories={categories} projectName={project.name} />
          <EquipmentCatalogView companyId={companyId} projectId={projectId} projectName={project.name} items={items} canManage={canManageCatalog} />
          <PaginationBar page={page} pageSize={pageSize} totalCount={totalCount} itemLabel={tr("itemsLabel")} />
        </div>
      );
    }
  } else if (tab === "inventory") {
    if (!hasAnyManageAccess) {
      body = <p className="text-sm text-muted-foreground">{tr("noAccessToInventory")}</p>;
    } else {
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
          <PaginationBar page={page} pageSize={pageSize} totalCount={totalCount} itemLabel={tr("itemsLabel")} />
        </div>
      );
    }
  } else if (tab === "issued") {
    const expiryFilter = urlParams.expiry === "expiring_soon" || urlParams.expiry === "expired" ? urlParams.expiry : "all";
    const assignments = await listEquipmentAssignments(companyId, projectId, { expiry: expiryFilter });
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {(["all", "expiring_soon", "expired"] as const).map((key) => (
            <Link
              key={key}
              href={key === "all" ? tabHref("issued") : `${tabHref("issued")}&expiry=${key}`}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                expiryFilter === key ? "border-primary bg-primary/10 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tr(`expiryFilters.${key}`)}
            </Link>
          ))}
        </div>
        <EquipmentIssuedView companyId={companyId} projectId={projectId} assignments={assignments} canManage={canManage} />
      </div>
    );
  } else if (tab === "expiring") {
    // Part 22 — a dedicated view of active assignments that are already
    // expired or expiring within 30 days (describeEquipmentExpiry's own
    // thresholds), reusing the Issued tab's data/component rather than a
    // parallel query — no new schema or duplicated fetch logic.
    const [expiringSoon, expired] = await Promise.all([
      listEquipmentAssignments(companyId, projectId, { expiry: "expiring_soon" }),
      listEquipmentAssignments(companyId, projectId, { expiry: "expired" }),
    ]);
    const assignments = [...expired, ...expiringSoon];
    body = <EquipmentIssuedView companyId={companyId} projectId={projectId} assignments={assignments} canManage={canManage} />;
  } else if (tab === "requests") {
    if (!canManage) {
      body = <p className="text-sm text-muted-foreground">{tr("noAccessToRequests")}</p>;
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
    if (itemId) {
      // Single-item view (reached from a "View history" link) — open to
      // anyone who can view that item at all; RLS on equipment_history
      // scopes the result, no manage-tier RPC involved.
      const item = await getEquipmentItem(companyId, projectId, itemId).catch(() => null);
      const entries = item ? await listEquipmentHistory(companyId, item.id) : [];
      body = <EquipmentHistoryView itemName={item?.name ?? null} entries={entries} />;
    } else if (!canManage) {
      body = <p className="text-sm text-muted-foreground">{tr("noAccessToHistory")}</p>;
    } else {
      // Part 27 — the project-wide, filterable feed. Management-tier
      // gated at the RPC layer (list_equipment_history_for_project), so
      // only reached here once canManage is already confirmed.
      const historyFilters: EquipmentHistoryListFilters = {
        itemId: urlParams.historyItemId,
        employeeId: urlParams.historyEmployeeId,
        event: urlParams.historyEvent as EquipmentHistoryEvent | undefined,
        fromDate: urlParams.historyFrom,
        toDate: urlParams.historyTo,
      };
      const [entries, filterItems, filterEmployeeRows] = await Promise.all([
        listEquipmentHistoryForProject(companyId, projectId, historyFilters),
        listEquipmentCandidateItems(companyId, projectId),
        listEquipmentCandidateEmployees(companyId, projectId),
      ]);
      body = (
        <div className="flex flex-col gap-4">
          <EquipmentHistoryFilters items={filterItems} employees={filterEmployeeRows} />
          <EquipmentHistoryView itemName={null} entries={entries} />
        </div>
      );
    }
  }

  const exportType = tab === "issued" || tab === "expiring" ? "issued" : tab === "requests" ? "requests" : tab === "history" ? "history" : tab === "catalog" ? "inventory" : "inventory";
  const canExport =
    (tab === "catalog" ? canManageCatalog : canManage) && tab !== "overview" && (tab !== "history" || Boolean(urlParams.itemId));
  const exportHref = `${basePath}/export?type=${exportType}${tab === "history" && urlParams.itemId ? `&itemId=${urlParams.itemId}` : ""}`;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title={tr("title")}
        description={project.name}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton />
            {canExport && (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={exportHref} />} className="print:hidden">
                <Download />
                {tr("export")}
              </Button>
            )}
            {canManage && tab === "inventory" && <AddEditEquipmentItemDialog companyId={companyId} projectId={projectId} projectName={project.name} />}
            {canManageCatalog && tab === "catalog" && <AddEditEquipmentItemDialog companyId={companyId} projectId={projectId} projectName={project.name} />}
          </div>
        }
      />

      <div className="flex flex-wrap gap-1 border-b">
        {TABS.filter((t) => (t.key !== "requests" && t.key !== "overview" ? true : canManage) && (t.key !== "catalog" || canManageCatalog)).map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tr(`tabs.${t.key}`)}
          </Link>
        ))}
      </div>

      {myEmployeeId === null && !canManage && (
        <p className="text-sm text-muted-foreground">
          {tr("noEmployeeRecord")}{" "}
          <span className="inline-flex items-center gap-1">
            <Wrench className="size-3.5" />
            {tr("contactAdministrator")}
          </span>
        </p>
      )}

      {body}
    </div>
  );
}
