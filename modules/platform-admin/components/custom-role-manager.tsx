"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createCustomRole, updateCustomRolePermissions, deleteCustomRole } from "@/modules/platform-admin/actions";
import { PERMISSION_DOMAIN_LABELS, type PermissionCatalogueItem } from "@/modules/platform-admin/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/shared/empty-state";
import { ShieldOff } from "lucide-react";

export type CustomRoleWithDetails = {
  id: string;
  name: string;
  description: string | null;
  permissionKeys: string[];
  holderNames: string[];
};

/**
 * Part 2 — Roles & Permissions page's custom-role CRUD. The permission
 * picker groups by domain and NEVER offers a reserved permission as
 * selectable (`assignablePermissions` below already excludes
 * is_reserved) — purely a UX nicety; the real gate is
 * create_custom_role()/update_custom_role_permissions()'s own server-side
 * is_reserved rejection, which this component does not and cannot
 * weaken.
 */
function PermissionPicker({
  assignablePermissions,
  selectedKeys,
  onToggle,
}: {
  assignablePermissions: PermissionCatalogueItem[];
  selectedKeys: Set<string>;
  onToggle: (key: string) => void;
}) {
  const byDomain = new Map<string, PermissionCatalogueItem[]>();
  for (const permission of assignablePermissions) {
    const list = byDomain.get(permission.domain) ?? [];
    list.push(permission);
    byDomain.set(permission.domain, list);
  }

  return (
    <div className="flex max-h-80 flex-col gap-4 overflow-y-auto rounded-md border p-3">
      {[...byDomain.entries()].map(([domain, permissions]) => (
        <div key={domain} className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase">{PERMISSION_DOMAIN_LABELS[domain] ?? domain}</p>
          <div className="flex flex-col gap-1.5">
            {permissions.map((permission) => (
              <label key={permission.key} className="flex items-start gap-2 text-sm">
                <Checkbox checked={selectedKeys.has(permission.key)} onCheckedChange={() => onToggle(permission.key)} className="mt-0.5" />
                <span className="flex flex-col">
                  <span className="font-medium">{permission.label}</span>
                  {permission.description && <span className="text-xs text-muted-foreground">{permission.description}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CreateCustomRoleDialog({ companyId, assignablePermissions }: { companyId: string; assignablePermissions: PermissionCatalogueItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleCreate() {
    if (!name.trim()) {
      setError("A role name is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createCustomRole({ companyId, name, description: description || undefined, permissionKeys: [...selectedKeys] });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success("Custom role created.");
      setOpen(false);
      setName("");
      setDescription("");
      setSelectedKeys(new Set());
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" />}>
        <Plus />
        New custom role
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New custom role</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-role-name">Name</Label>
            <Input id="new-role-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-role-description">Description (optional)</Label>
            <Textarea id="new-role-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={2} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Permissions</Label>
            <PermissionPicker assignablePermissions={assignablePermissions} selectedKeys={selectedKeys} onToggle={toggle} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={isPending} onClick={handleCreate}>
            {isPending ? "Creating…" : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditCustomRoleDialog({ role, assignablePermissions }: { role: CustomRoleWithDetails; assignablePermissions: PermissionCatalogueItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set(role.permissionKeys));
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateCustomRolePermissions(role.id, { permissionKeys: [...selectedKeys] });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success("Role permissions updated.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}>Edit permissions</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit permissions — {role.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <PermissionPicker assignablePermissions={assignablePermissions} selectedKeys={selectedKeys} onToggle={toggle} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={isPending} onClick={handleSave}>
            {isPending ? "Saving…" : "Save permissions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCustomRoleButton({ role }: { role: CustomRoleWithDetails }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const canDelete = role.holderNames.length === 0;

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteCustomRole(role.id);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Custom role deleted.");
      router.refresh();
    });
  }

  return (
    <Button type="button" size="sm" variant="outline" className="text-destructive" disabled={!canDelete || isPending} onClick={handleDelete} title={canDelete ? undefined : "Remove all assignments before deleting this role"}>
      <Trash2 />
      Delete
    </Button>
  );
}

export function CustomRoleCard({ role, assignablePermissions, permissionLabelByKey }: { role: CustomRoleWithDetails; assignablePermissions: PermissionCatalogueItem[]; permissionLabelByKey: Map<string, string> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
          <span>{role.name}</span>
          <div className="flex gap-2">
            <EditCustomRoleDialog role={role} assignablePermissions={assignablePermissions} />
            <DeleteCustomRoleButton role={role} />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {role.description && <p className="text-sm text-muted-foreground">{role.description}</p>}
        <div className="flex flex-wrap gap-1.5">
          {role.permissionKeys.length === 0 ? (
            <span className="text-xs text-muted-foreground">No permissions granted</span>
          ) : (
            role.permissionKeys.map((key) => (
              <Badge key={key} variant="secondary">
                {permissionLabelByKey.get(key) ?? key}
              </Badge>
            ))
          )}
        </div>
        <div className="flex flex-col gap-1 border-t pt-2">
          <span className="text-xs font-medium text-muted-foreground uppercase">Assigned to</span>
          {role.holderNames.length === 0 ? (
            <span className="text-sm text-muted-foreground">No one currently holds this role.</span>
          ) : (
            <span className="text-sm">{role.holderNames.join(", ")}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function NoCustomRolesEmptyState() {
  return <EmptyState icon={ShieldOff} title="No custom roles yet" description="Create a company-scoped custom role from an explicit set of permissions." />;
}
