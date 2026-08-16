import { requirePlatformSuperAdmin } from "@/lib/auth/session";
import { listSystemRoles, listPermissionsCatalogue, listRolePermissionsForRoles, searchAdminCompanies, listCustomRolesForCompany, listAdminCompanyMembers } from "@/modules/platform-admin/queries";
import { PERMISSION_DOMAIN_LABELS } from "@/modules/platform-admin/types";
import { CompanyRoleSelector } from "@/modules/platform-admin/components/company-role-selector";
import { CreateCustomRoleDialog, CustomRoleCard, NoCustomRolesEmptyState, type CustomRoleWithDetails } from "@/modules/platform-admin/components/custom-role-manager";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock } from "lucide-react";

type PageProps = { searchParams: Promise<Record<string, string | undefined>> };

/**
 * Part 2 — Roles & Permissions. System roles are read-only here (their
 * enforcement stays exactly where it always has been — RLS + modules/*
 * /permissions.ts — this page never touches that); custom roles are
 * fully definable/assignable/audited via create_custom_role()/
 * update_custom_role_permissions()/delete_custom_role(). See this
 * milestone's own report for the explicit, deliberate scope note: custom
 * roles are NOT YET consulted by any operational module's own
 * authorization — assigning one grants nothing beyond the base company
 * membership today.
 */
export default async function PlatformAdminRolesPage({ searchParams }: PageProps) {
  await requirePlatformSuperAdmin();
  const params = await searchParams;
  const companyQuery = params.q?.trim() || null;
  const selectedCompanyId = params.companyId || null;

  const [systemRoles, permissions, companies] = await Promise.all([listSystemRoles(), listPermissionsCatalogue(), searchAdminCompanies(companyQuery, 20)]);
  const systemRolePermissions = await listRolePermissionsForRoles(systemRoles.map((role) => role.id));

  const assignablePermissions = permissions.filter((permission) => !permission.is_reserved);
  const permissionLabelByKey = new Map(permissions.map((permission) => [permission.key, permission.label]));

  let customRoles: CustomRoleWithDetails[] = [];
  let selectedCompanyName: string | null = null;
  if (selectedCompanyId) {
    const [roles, members] = await Promise.all([listCustomRolesForCompany(selectedCompanyId), listAdminCompanyMembers(selectedCompanyId)]);
    selectedCompanyName = companies.find((c) => c.id === selectedCompanyId)?.name ?? null;
    const keysByRole = await listRolePermissionsForRoles(roles.map((role) => role.id));
    customRoles = roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      permissionKeys: keysByRole.get(role.id) ?? [],
      holderNames: members.filter((member) => member.role_ids.includes(role.id)).map((member) => member.full_name),
    }));
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Roles &amp; Permissions" description="The built-in system roles (read-only) and each company's custom roles." />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Lock className="size-4" />
            System roles — built-in, protected
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            These {systemRoles.length} roles are enforced throughout the platform by row-level security and each module&apos;s own authorization checks — they cannot be edited or deleted here. The permissions shown below are an
            informational, best-effort mirror of their real current behavior, not the enforcement mechanism itself.
          </p>
          <div className="flex flex-col gap-3">
            {systemRoles.map((role) => (
              <div key={role.id} className="rounded-md border p-3">
                <p className="text-sm font-medium capitalize">{role.name.replace(/_/g, " ")}</p>
                {role.description && <p className="text-xs text-muted-foreground">{role.description}</p>}
                <div className="mt-2 flex flex-wrap gap-1">
                  {(systemRolePermissions.get(role.id) ?? []).map((key) => (
                    <Badge key={key} variant="outline">
                      {permissionLabelByKey.get(key) ?? key}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Custom roles</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            <strong className="font-medium text-foreground">Custom permission enforcement rollout pending.</strong> Custom roles below are real, company-scoped, and fully audited (create/edit/delete), but assigning one — or
            granting it permissions — does not yet change what its holder can actually do in Scaffold Register, LMRA, or any other operational module. Only the built-in system roles above are enforced today.
          </p>
          <CompanyRoleSelector companies={companies} selectedCompanyId={selectedCompanyId} query={companyQuery} />

          {!selectedCompanyId ? (
            <p className="text-sm text-muted-foreground">Select a company above to view or manage its custom roles.</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{selectedCompanyName ?? "Selected company"}</p>
                <CreateCustomRoleDialog companyId={selectedCompanyId} assignablePermissions={assignablePermissions} />
              </div>
              {customRoles.length === 0 ? (
                <NoCustomRolesEmptyState />
              ) : (
                <div className="flex flex-col gap-3">
                  {customRoles.map((role) => (
                    <CustomRoleCard key={role.id} role={role} assignablePermissions={assignablePermissions} permissionLabelByKey={permissionLabelByKey} />
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Permissions are grouped by domain: {Object.values(PERMISSION_DOMAIN_LABELS).join(", ")}. Reserved permissions (company administration, role management) are never offered here and are rejected server-side even if
        requested directly.
      </p>
    </div>
  );
}
