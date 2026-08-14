import type { Database, Enums } from "@/types/database";

/**
 * Company invitations — Onboarding items 13/14/16. See
 * supabase/migrations/20260829090000_onboarding.sql's header comment for
 * the full design rationale (why every mutation goes through a SECURITY
 * DEFINER RPC, why only a token HASH is ever stored).
 */
export type CompanyInvitation = Database["public"]["Tables"]["company_invitations"]["Row"];
export type CompanyInvitationStatus = Enums<"company_invitation_status">;

/** "Expired" is a DISPLAY-computed state, never a fourth stored status — matches the migration's own comment and this codebase's general convention of deriving display state (e.g. getScaffoldDisplayStatus) rather than duplicating it. */
export type CompanyInvitationDisplayStatus = "pending" | "accepted" | "revoked" | "expired";

export function invitationDisplayStatus(invitation: Pick<CompanyInvitation, "status" | "expires_at">): CompanyInvitationDisplayStatus {
  if (invitation.status === "pending" && new Date(invitation.expires_at).getTime() < Date.now()) {
    return "expired";
  }
  return invitation.status;
}

export const INVITATION_STATUS_LABELS: Record<CompanyInvitationDisplayStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  expired: "Expired",
  revoked: "Revoked",
};

/** Pending/Expired = orange (attention); Accepted = green; Revoked = gray — matches item 13's status/color spec. */
export function invitationStatusTone(status: CompanyInvitationDisplayStatus): "positive" | "attention" | "negative" | "neutral" {
  switch (status) {
    case "accepted":
      return "positive";
    case "pending":
    case "expired":
      return "attention";
    case "revoked":
      return "neutral";
  }
}

/** One invitation resolved with the inviter's display name — the Members admin invitations list row shape. */
export type CompanyInvitationWithInviter = CompanyInvitation & {
  invitedByName: string | null;
};
