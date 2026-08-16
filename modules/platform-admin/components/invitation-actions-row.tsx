"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { resendInvitation, revokeInvitation } from "@/modules/invitations/actions";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";

/**
 * Part 2C — resend/revoke a pending invitation from the Company detail
 * page. Reuses modules/invitations/actions.ts exactly (both RPCs already
 * accept a platform super admin via is_platform_super_admin() OR the
 * company's own company_admin/operations_manager) — no parallel
 * invitation mechanism.
 */
export function InvitationActionsRow({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [link, setLink] = useState<string | null>(null);

  function handleResend() {
    startTransition(async () => {
      const result = await resendInvitation(invitationId);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setLink(`${window.location.origin}/accept-invite/${result.data.token}`);
      toast.success("Invitation resent.");
      router.refresh();
    });
  }

  function handleRevoke() {
    startTransition(async () => {
      const result = await revokeInvitation(invitationId, { reason: undefined });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Invitation revoked.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {link && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            navigator.clipboard.writeText(link);
            toast.success("Copied.");
          }}
        >
          <Copy />
          Copy link
        </Button>
      )}
      <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={handleResend}>
        Resend
      </Button>
      <Button type="button" size="sm" variant="outline" className="text-destructive" disabled={isPending} onClick={handleRevoke}>
        Revoke
      </Button>
    </div>
  );
}
