"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldOff, X } from "lucide-react";
import { toast } from "sonner";
import { assignEmployeeRole, removeEmployeeRole } from "@/modules/employees/actions";
import { assignableRoleNamesFor } from "@/modules/employees/permissions";
import type { EmployeeRoleInfo } from "@/modules/employees/types";
import type { RoleName } from "@/modules/organizations/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";

type EmployeeRolesTabProps = {
  organizationId: string;
  employeeId: string;
  hasLinkedAccount: boolean;
  roleInfo: EmployeeRoleInfo;
  allRoles: { id: string; name: string; display_label: string }[];
  canManage: boolean;
  actorRoleNames: RoleName[];
};

/**
 * Roles come entirely from `organization_memberships`/`membership_roles`/
 * `roles` — this is deliberately NOT a second role system for employees
 * (this milestone's explicit constraint). An employee record can exist
 * before its linked account is activated (`docs/PRODUCT_REQUIREMENTS.md`),
 * so this tab has three distinct states rather than one degraded view:
 * no linked profile, linked but not yet an active member, and active member
 * with assignable roles.
 */
export function EmployeeRolesTab({
  organizationId,
  employeeId,
  hasLinkedAccount,
  roleInfo,
  allRoles,
  canManage,
  actorRoleNames,
}: EmployeeRolesTabProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");

  if (!hasLinkedAccount || !roleInfo.membershipId) {
    return (
      <EmptyState
        icon={ShieldOff}
        title="Roles aren't assignable yet"
        description="This employee has no linked, active account in this organization yet. Roles become assignable once account activation is implemented and this employee accepts an invitation."
      />
    );
  }

  const assignedRoleIds = new Set(roleInfo.roles.map((role) => role.roleId));
  const assignableNames = new Set(assignableRoleNamesFor(actorRoleNames, allRoles.map((role) => role.name as RoleName)));
  const assignableRoles = allRoles.filter((role) => !assignedRoleIds.has(role.id) && assignableNames.has(role.name as RoleName));

  function handleAssign() {
    if (!selectedRoleId || !roleInfo.membershipId) return;
    startTransition(async () => {
      const result = await assignEmployeeRole(organizationId, employeeId, roleInfo.membershipId!, selectedRoleId);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setSelectedRoleId("");
      router.refresh();
    });
  }

  function handleRemove(membershipRoleId: string) {
    setRemovingId(membershipRoleId);
    startTransition(async () => {
      const result = await removeEmployeeRole(organizationId, employeeId, membershipRoleId);
      setRemovingId(null);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {roleInfo.roles.length === 0 ? (
          <p className="text-sm text-muted-foreground">No roles assigned yet.</p>
        ) : (
          roleInfo.roles.map((role) => (
            <Badge key={role.membershipRoleId} variant="secondary" className="gap-1 pr-1">
              {role.label}
              {canManage && (
                <button
                  type="button"
                  aria-label={`Remove ${role.name} role`}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                  disabled={isPending && removingId === role.membershipRoleId}
                  onClick={() => handleRemove(role.membershipRoleId)}
                >
                  {isPending && removingId === role.membershipRoleId ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <X className="size-3" />
                  )}
                </button>
              )}
            </Badge>
          ))
        )}
      </div>

      {canManage && assignableRoles.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedRoleId} onValueChange={(value) => setSelectedRoleId(value ?? "")}>
            <SelectTrigger className="w-56" aria-label="Role to assign">
              <SelectValue placeholder="Select a role to assign" />
            </SelectTrigger>
            <SelectContent>
              {assignableRoles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.display_label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!selectedRoleId || isPending} onClick={handleAssign}>
            {isPending && !removingId ? <Loader2 className="animate-spin" /> : null}
            Assign role
          </Button>
        </div>
      )}
    </div>
  );
}
