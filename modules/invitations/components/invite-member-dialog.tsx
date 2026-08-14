"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Mail, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { createInvitation } from "@/modules/invitations/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type RoleOption = { id: string; name: string; display_label: string };
type ProjectOption = { id: string; name: string };

/**
 * Item 13 — "Invite Member". No outbound email provider is configured in
 * this environment (disclosed, matching item 15's explicit allowance) — on
 * success this shows the real activation link so the inviter can copy and
 * send it themselves, rather than silently claiming an email was sent.
 */
export function InviteMemberDialog({ companyId, assignableRoles, projects }: { companyId: string; assignableRoles: RoleOption[]; projects: ProjectOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [selectedRoleNames, setSelectedRoleNames] = useState<string[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  function toggleRole(name: string, checked: boolean) {
    setSelectedRoleNames((prev) => (checked ? [...prev, name] : prev.filter((r) => r !== name)));
  }

  function reset() {
    setEmail("");
    setFullName("");
    setSelectedRoleNames([]);
    setProjectId(null);
    setError(null);
    setInviteLink(null);
  }

  function handleSubmit() {
    if (!email.trim() || !fullName.trim() || selectedRoleNames.length === 0) {
      setError("Email, name, and at least one role are required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createInvitation(companyId, { email, fullName, roleNames: selectedRoleNames, projectId: projectId ?? undefined, employeeId: undefined });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      const link = `${window.location.origin}/accept-invite/${result.data.token}`;
      setInviteLink(link);
      toast.success("Invitation created.");
      router.refresh();
    });
  }

  function copyLink() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    toast.success("Invite link copied.");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <UserPlus />
        Invite Member
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Member</DialogTitle>
          <DialogDescription>{inviteLink ? "Share this link with them — it's shown once." : "They'll get access once they accept."}</DialogDescription>
        </DialogHeader>

        {inviteLink ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-md border p-2">
              <Mail className="size-4 shrink-0 text-muted-foreground" />
              <code className="flex-1 truncate text-xs">{inviteLink}</code>
              <Button type="button" size="sm" variant="ghost" onClick={copyLink}>
                <Copy />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">No email provider is configured — copy this link and send it to them directly. It expires in 7 days.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-name">Full name</Label>
              <Input id="invite-name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Role(s)</Label>
              <div className="flex flex-col gap-1.5 rounded-md border p-2">
                {assignableRoles.map((role) => (
                  <div key={role.id} className="flex items-center gap-2">
                    <Checkbox id={`invite-role-${role.name}`} checked={selectedRoleNames.includes(role.name)} onCheckedChange={(checked) => toggleRole(role.name, checked === true)} />
                    <Label htmlFor={`invite-role-${role.name}`} className="text-sm font-normal">
                      {role.display_label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            {projects.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>Project (optional)</Label>
                <Select value={projectId ?? ""} onValueChange={(value) => setProjectId(value || null)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="No project yet" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          {inviteLink ? (
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" disabled={isPending} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={isPending} onClick={handleSubmit}>
                {isPending ? "Sending…" : "Send invitation"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
