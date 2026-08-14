import type { Metadata } from "next";
import { MailX } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveInvitationPreview } from "@/modules/invitations/queries";
import { invitationDisplayStatus, INVITATION_STATUS_LABELS } from "@/modules/invitations/types";
import { AcceptInviteForm } from "@/modules/invitations/components/accept-invite-form";

export const metadata: Metadata = { title: "Accept Invitation" };

type PageProps = { params: Promise<{ token: string }> };

/**
 * Items 16/17 — the public, unauthenticated entry point an invitee
 * follows. Deliberately outside the (app) route group (mirrors
 * app/share/[token]/page.tsx exactly) — no sidebar, no company/project
 * context, since the invitee may not even have an account yet.
 * Authorization is entirely the invitation token
 * (resolve_invitation_preview()/accept_invitation()), never session
 * state — this page itself never requires a session to RENDER, only to
 * ACCEPT.
 */
export default async function AcceptInvitePage({ params }: PageProps) {
  const { token } = await params;
  const [preview, user] = await Promise.all([resolveInvitationPreview(token), getCurrentUser()]);

  if (!preview) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-8 text-center">
        <MailX className="size-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">This invitation link is unavailable</h1>
        <p className="max-w-sm text-sm text-muted-foreground">The link may be invalid. Ask whoever invited you to send a new one.</p>
      </div>
    );
  }

  const displayStatus = invitationDisplayStatus({ status: preview.status, expires_at: preview.expires_at });
  if (displayStatus !== "pending") {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-8 text-center">
        <MailX className="size-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">This invitation is {INVITATION_STATUS_LABELS[displayStatus].toLowerCase()}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {displayStatus === "accepted" ? "It has already been used — sign in to your account instead." : "Ask whoever invited you to send a new one."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-8">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-lg font-semibold">You&apos;ve been invited to {preview.company_name}</h1>
          <p className="text-sm text-muted-foreground">
            {preview.inviter_name ? `${preview.inviter_name} invited` : "You were invited as"} {preview.email} ({preview.role_names.join(", ")})
          </p>
        </div>
        <AcceptInviteForm token={token} invitedEmail={preview.email} isAuthenticated={Boolean(user)} authenticatedEmail={user?.email ?? null} />
      </div>
    </div>
  );
}
