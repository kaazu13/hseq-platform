"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, RotateCcw, XCircle, Mail } from "lucide-react";
import { toast } from "sonner";
import { resendInvitation, revokeInvitation } from "@/modules/invitations/actions";
import { INVITATION_STATUS_LABELS, invitationDisplayStatus, invitationStatusTone } from "@/modules/invitations/types";
import type { CompanyInvitationWithInviter } from "@/modules/invitations/types";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** Item 14/20 — resend/revoke, surfaced right in the row; a fresh link is shown once after resend, matching InviteMemberDialog's own "no email provider" disclosure. */
export function InvitationsList({ invitations }: { invitations: CompanyInvitationWithInviter[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [resentLink, setResentLink] = useState<{ id: string; link: string } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<CompanyInvitationWithInviter | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleResend(invitationId: string) {
    setError(null);
    startTransition(async () => {
      const result = await resendInvitation(invitationId);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setResentLink({ id: invitationId, link: `${window.location.origin}/accept-invite/${result.data.token}` });
      toast.success("Invitation resent — copy the new link below.");
      router.refresh();
    });
  }

  function handleRevoke() {
    if (!revokeTarget) return;
    setError(null);
    startTransition(async () => {
      const result = await revokeInvitation(revokeTarget.id, { reason: revokeReason || undefined });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success("Invitation revoked.");
      setRevokeTarget(null);
      setRevokeReason("");
      router.refresh();
    });
  }

  if (invitations.length === 0) {
    return <EmptyState icon={Mail} title="No invitations yet" description="Invitations you send will appear here with their status." className="flex-1" />;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {invitations.map((invitation) => {
        const displayStatus = invitationDisplayStatus(invitation);
        return (
          <Card key={invitation.id}>
            <CardContent className="flex flex-col gap-2 pt-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{invitation.full_name}</p>
                  <p className="text-xs text-muted-foreground">{invitation.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {invitation.role_names.join(", ")} · Invited {formatDate(invitation.created_at)}
                    {invitation.invitedByName ? ` by ${invitation.invitedByName}` : ""}
                  </p>
                </div>
                <StatusBadge tone={invitationStatusTone(displayStatus)}>{INVITATION_STATUS_LABELS[displayStatus]}</StatusBadge>
              </div>

              {(displayStatus === "pending" || displayStatus === "expired") && (
                <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                  <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => handleResend(invitation.id)}>
                    <RotateCcw />
                    Resend
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => setRevokeTarget(invitation)}>
                    <XCircle />
                    Revoke
                  </Button>
                </div>
              )}

              {resentLink?.id === invitation.id && (
                <div className="flex items-center gap-2 rounded-md border p-2">
                  <code className="flex-1 truncate text-xs">{resentLink.link}</code>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(resentLink.link);
                      toast.success("Link copied.");
                    }}
                  >
                    <Copy />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={revokeTarget !== null} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke invitation</DialogTitle>
            <DialogDescription>{revokeTarget?.email} won&apos;t be able to use this link anymore.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Textarea rows={2} placeholder="Reason (optional)" value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={isPending} onClick={handleRevoke}>
              {isPending ? "Revoking…" : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
