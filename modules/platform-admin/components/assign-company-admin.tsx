"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { platformAdminGrantCompanyMembership, searchAccountsForCompanyCreation } from "@/modules/platform-admin/actions";
import { createInvitation } from "@/modules/invitations/actions";
import type { PlatformAccountSearchResult } from "@/modules/platform-admin/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Part 2C — the SAME "assign existing account" / "invite new email" pair
 * of paths CreateCompanyWizard's admin step offers, reused here for a
 * company that skipped assigning an administrator at creation time (or
 * simply needs another one later). Deliberately reuses
 * platformAdminGrantCompanyMembership/createInvitation directly — no
 * parallel invitation mechanism.
 */
export function AssignCompanyAdmin({ companyId, companyName }: { companyId: string; companyName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"existing" | "invite">("invite");
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlatformAccountSearchResult[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  function handleSearch(query: string) {
    setSearchQuery(query);
    startTransition(async () => {
      const results = await searchAccountsForCompanyCreation(query);
      setSearchResults(results);
    });
  }

  function handleGrantExisting() {
    if (!selectedAccountId) return;
    setError(null);
    startTransition(async () => {
      const result = await platformAdminGrantCompanyMembership(companyId, { userId: selectedAccountId, roleNames: ["company_admin"] });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success("Company administrator added.");
      setSelectedAccountId(null);
      router.refresh();
    });
  }

  function handleInviteAdmin() {
    if (!inviteEmail.trim() || !inviteName.trim()) {
      setError("Email and name are required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createInvitation(companyId, { email: inviteEmail, fullName: inviteName, roleNames: ["company_admin"], projectId: undefined, employeeId: undefined });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setInviteLink(`${window.location.origin}/accept-invite/${result.data.token}`);
      toast.success("Invitation created.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Assign a company administrator for {companyName}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={mode === "invite" ? "default" : "outline"} onClick={() => setMode("invite")}>
            New email
          </Button>
          <Button type="button" size="sm" variant={mode === "existing" ? "default" : "outline"} onClick={() => setMode("existing")}>
            Existing account
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {inviteLink ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">No email provider is configured — share this link with the new administrator directly:</p>
            <div className="flex items-center gap-2 rounded-md border p-2">
              <code className="flex-1 truncate text-xs">{inviteLink}</code>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(inviteLink);
                  toast.success("Copied.");
                }}
              >
                <Copy />
              </Button>
            </div>
          </div>
        ) : mode === "invite" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="assign-admin-email">Email</Label>
              <Input id="assign-admin-email" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="assign-admin-name">Full name</Label>
              <Input id="assign-admin-name" value={inviteName} onChange={(event) => setInviteName(event.target.value)} />
            </div>
            <Button type="button" disabled={isPending} onClick={handleInviteAdmin} className="w-fit">
              <UserPlus />
              {isPending ? "Sending…" : "Send invitation"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <Input placeholder="Search by name or email…" className="pl-8" value={searchQuery} onChange={(event) => handleSearch(event.target.value)} />
            </div>
            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {searchResults.map((account) => (
                <button
                  type="button"
                  key={account.id}
                  onClick={() => setSelectedAccountId(account.id)}
                  className={`rounded-md border p-2 text-left text-sm ${selectedAccountId === account.id ? "border-primary bg-primary/5" : ""}`}
                >
                  {account.full_name} — {account.email}
                </button>
              ))}
            </div>
            <Button type="button" disabled={isPending || !selectedAccountId} onClick={handleGrantExisting} className="w-fit">
              <UserPlus />
              {isPending ? "Adding…" : "Make company administrator"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
