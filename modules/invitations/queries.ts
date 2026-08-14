import { createClient } from "@/lib/supabase/server";
import type { CompanyInvitation, CompanyInvitationWithInviter } from "./types";

/** Server-only data access for the invitation lifecycle (items 13/14/20). RLS (company_invitations_select) already scopes every query below to what the caller is actually allowed to see — management sees their company's invitations, an invitee sees their own pending one by email match. */

export async function listInvitationsForCompany(companyId: string): Promise<CompanyInvitationWithInviter[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("company_invitations").select("*").eq("company_id", companyId).order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];

  const inviterIds = [...new Set(rows.map((row) => row.invited_by).filter((id): id is string => id !== null))];
  const inviterNames = new Map<string, string>();
  if (inviterIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id, full_name").in("id", inviterIds);
    if (profilesError) throw profilesError;
    for (const profile of profiles ?? []) inviterNames.set(profile.id, profile.full_name);
  }

  return rows.map((row) => ({ ...row, invitedByName: row.invited_by ? (inviterNames.get(row.invited_by) ?? null) : null }));
}

export async function getInvitation(invitationId: string): Promise<CompanyInvitation | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("company_invitations").select("*").eq("id", invitationId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Anon-safe preview for the accept-invite page — see resolve_invitation_preview()'s own comment for why this can't just be a plain RLS-gated select (the invitee may not have an account yet). */
export type InvitationPreview = {
  company_name: string;
  inviter_name: string | null;
  email: string;
  full_name: string;
  role_names: string[];
  status: "pending" | "accepted" | "revoked";
  expires_at: string;
} | null;

export async function resolveInvitationPreview(token: string): Promise<InvitationPreview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_invitation_preview", { target_token: token });
  if (error) return null;
  return (data as InvitationPreview) ?? null;
}
