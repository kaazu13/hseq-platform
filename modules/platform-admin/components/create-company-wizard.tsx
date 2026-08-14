"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Building2, CheckCircle2, Copy, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { createCompany, platformAdminGrantCompanyMembership, searchAccountsForCompanyCreation } from "@/modules/platform-admin/actions";
import { createInvitation } from "@/modules/invitations/actions";
import type { Company } from "@/modules/companies/types";
import type { PlatformAccountSearchResult } from "@/modules/platform-admin/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Step = "company" | "admin" | "done";

/**
 * Onboarding items 1/2 — one guided flow: create the company (item 1),
 * then assign its first company_admin either directly (an existing
 * platform account) or via invitation (a new email) — item 2's two
 * explicit paths. The first admin is never made a platform_super_admin
 * by this flow (item 2's explicit requirement) — path A only ever grants
 * the `company_admin` COMPANY role, never touches platform_super_admins.
 */
export function CreateCompanyWizard() {
  const [step, setStep] = useState<Step>("company");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<Company | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [prefix, setPrefix] = useState("");

  const [adminMode, setAdminMode] = useState<"existing" | "invite">("invite");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlatformAccountSearchResult[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  function handleCreateCompany() {
    if (!name.trim()) {
      setError("A company name is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createCompany({ name, slug: slug || undefined, employeeNumberPrefix: prefix || undefined });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setCompany(result.data);
      setStep("admin");
      toast.success("Company created.");
    });
  }

  function handleSearch(query: string) {
    setSearchQuery(query);
    startTransition(async () => {
      const results = await searchAccountsForCompanyCreation(query);
      setSearchResults(results);
    });
  }

  function handleGrantExisting() {
    if (!company || !selectedAccountId) return;
    setError(null);
    startTransition(async () => {
      const result = await platformAdminGrantCompanyMembership(company.id, { userId: selectedAccountId, roleNames: ["company_admin"] });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success("Company administrator added.");
      setStep("done");
    });
  }

  function handleInviteAdmin() {
    if (!company || !inviteEmail.trim() || !inviteName.trim()) {
      setError("Email and name are required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createInvitation(company.id, { email: inviteEmail, fullName: inviteName, roleNames: ["company_admin"], projectId: undefined, employeeId: undefined });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setInviteLink(`${window.location.origin}/accept-invite/${result.data.token}`);
      toast.success("Invitation created.");
      setStep("done");
    });
  }

  if (step === "done") {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4 pt-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-green-600" />
            <p className="text-sm font-medium">{company?.name} is set up.</p>
          </div>
          {inviteLink && (
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
          )}
          <Button type="button" nativeButton={false} render={<Link href="/platform-admin" />}>
            Back to Platform Administration
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step === "admin" && company) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4 pt-4">
          <p className="text-sm font-medium">Assign the first company administrator for {company.name}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={adminMode === "invite" ? "default" : "outline"} onClick={() => setAdminMode("invite")}>
              New email
            </Button>
            <Button type="button" size="sm" variant={adminMode === "existing" ? "default" : "outline"} onClick={() => setAdminMode("existing")}>
              Existing account
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {adminMode === "invite" ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="admin-email">Email</Label>
                <Input id="admin-email" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="admin-name">Full name</Label>
                <Input id="admin-name" value={inviteName} onChange={(event) => setInviteName(event.target.value)} />
              </div>
              <Button type="button" disabled={isPending} onClick={handleInviteAdmin}>
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
              <Button type="button" disabled={isPending || !selectedAccountId} onClick={handleGrantExisting}>
                <UserPlus />
                {isPending ? "Adding…" : "Make company administrator"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-4">
        <div className="flex items-center gap-2">
          <Building2 className="size-5 text-muted-foreground" />
          <p className="text-sm font-medium">Company details</p>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="company-name">Company name</Label>
          <Input id="company-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="company-slug">Slug (optional)</Label>
          <Input id="company-slug" value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="auto-generated from the name if left blank" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="company-prefix">Employee number prefix (optional)</Label>
          <Input id="company-prefix" value={prefix} onChange={(event) => setPrefix(event.target.value)} placeholder="auto-generated from the name if left blank" />
        </div>
        <Button type="button" disabled={isPending} onClick={handleCreateCompany}>
          {isPending ? "Creating…" : "Create company"}
        </Button>
      </CardContent>
    </Card>
  );
}
