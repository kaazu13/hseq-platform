"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, ShieldPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { grantPlatformSuperAdmin, revokePlatformSuperAdmin, searchAccountsForCompanyCreation } from "@/modules/platform-admin/actions";
import type { PlatformAccountSearchResult, PlatformSuperAdminRosterItem } from "@/modules/platform-admin/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

/**
 * Part 2 Platform Settings page — the missing read/manage UI for
 * grant_platform_super_admin()/revoke_platform_super_admin()
 * (20260819095000_platform_admin.sql), which previously had server
 * actions but no dedicated surface (confirmed by inspection — the old
 * platform-admin page never called either).
 */
export function GrantSuperAdminForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlatformAccountSearchResult[]>([]);

  function handleSearch(value: string) {
    setQuery(value);
    startTransition(async () => {
      setResults(await searchAccountsForCompanyCreation(value));
    });
  }

  function handleGrant(userId: string) {
    startTransition(async () => {
      const result = await grantPlatformSuperAdmin(userId);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Platform administrator access granted.");
      setResults([]);
      setQuery("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-4">
        <p className="text-sm font-medium">Grant platform administrator access</p>
        <div className="relative max-w-sm">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input placeholder="Search by name or email…" className="pl-8" value={query} onChange={(event) => handleSearch(event.target.value)} />
        </div>
        {results.length > 0 && (
          <div className="flex max-w-sm flex-col gap-1">
            {results.map((account) => (
              <div key={account.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <span>
                  {account.full_name} — {account.email}
                </span>
                <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => handleGrant(account.id)}>
                  <ShieldPlus />
                  Grant
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SuperAdminRosterTable({ roster, currentUserId }: { roster: PlatformSuperAdminRosterItem[]; currentUserId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingRevoke, setPendingRevoke] = useState<PlatformSuperAdminRosterItem | null>(null);

  function handleRevoke() {
    if (!pendingRevoke) return;
    startTransition(async () => {
      const result = await revokePlatformSuperAdmin(pendingRevoke.user_id);
      if (!result.ok) {
        toast.error(result.error.message);
        setPendingRevoke(null);
        return;
      }
      toast.success("Platform administrator access revoked.");
      setPendingRevoke(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {roster.map((admin) => {
        const isSelf = admin.user_id === currentUserId;
        return (
          <Card key={admin.user_id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4">
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {admin.full_name} — {admin.email}
                  {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  Granted {new Date(admin.granted_at).toLocaleDateString()}
                  {admin.granted_by_name ? ` by ${admin.granted_by_name}` : ""}
                  {admin.notes ? ` — ${admin.notes}` : ""}
                </span>
              </div>
              <Button type="button" size="sm" variant="outline" className="text-destructive" disabled={isSelf || isPending} title={isSelf ? "You cannot revoke your own access" : undefined} onClick={() => setPendingRevoke(admin)}>
                <Trash2 />
                Revoke
              </Button>
            </CardContent>
          </Card>
        );
      })}

      <AlertDialog open={pendingRevoke !== null} onOpenChange={(open) => !open && setPendingRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke platform administrator access</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRevoke?.full_name} will immediately lose platform-wide administrator access. Their company memberships and employment records are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => setPendingRevoke(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={isPending} onClick={handleRevoke}>
              {isPending ? "Revoking…" : "Revoke access"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
