/**
 * Hand-written Supabase database types for this milestone's schema.
 *
 * docs/ARCHITECTURE.md §4 describes this file as generated build output
 * (`supabase gen types typescript`). It's hand-written here instead
 * because generating it requires a linked Supabase project (`supabase
 * link`) and this milestone deliberately does not link or apply anything
 * remotely — see the implementation report. The shape below matches what
 * `@supabase/postgrest-js` actually requires (`GenericSchema` /
 * `GenericTable` — every table needs `Row`/`Insert`/`Update`/
 * `Relationships`, and the schema needs a `Views` map, even though this
 * project uses neither database views nor PostgREST embeds yet) closely
 * enough that swapping in a real generated file later is a drop-in
 * replacement, not a rewrite.
 *
 * REPLACE this file by running the real command once the project is
 * linked:
 *   supabase gen types typescript --project-id <id> --schema public > types/database.ts
 *
 * Keep it in sync with supabase/migrations/*.sql by hand until then.
 * `Relationships` is left as `[]` (not modeled) for every table —
 * modules/organizations/queries.ts deliberately avoids PostgREST embedded
 * selects for exactly this reason; see that file's header comment.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type OrganizationStatus = "trial" | "active" | "suspended";
export type MembershipStatus = "invited" | "active" | "suspended" | "removed";
export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "restore"
  | "approve"
  | "reject"
  | "sign"
  | "close"
  | "amend";

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          status: OrganizationStatus;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          status?: OrganizationStatus;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string;
          phone: string | null;
          active_organization_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          phone?: string | null;
          active_organization_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      organization_memberships: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          status: MembershipStatus;
          invited_at: string | null;
          joined_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          status?: MembershipStatus;
          invited_at?: string | null;
          joined_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["organization_memberships"]["Insert"]>;
        Relationships: [];
      };
      roles: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          is_system: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          is_system?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["roles"]["Insert"]>;
        Relationships: [];
      };
      membership_roles: {
        Row: {
          id: string;
          organization_id: string;
          membership_id: string;
          role_id: string;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          membership_id: string;
          role_id: string;
          created_at?: string;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["membership_roles"]["Insert"]>;
        Relationships: [];
      };
      audit_events: {
        Row: {
          id: string;
          organization_id: string | null;
          actor_user_id: string | null;
          action: AuditAction;
          entity_type: string;
          entity_id: string;
          changes: Json | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          actor_user_id?: string | null;
          action: AuditAction;
          entity_type: string;
          entity_id: string;
          changes?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
        // No real Update shape — audit_events has no UPDATE RLS policy, no
        // UPDATE grant, and a hard trigger that rejects it unconditionally
        // (see supabase/migrations/20260725090700_functions_and_triggers.sql).
        // `Record<string, never>` still satisfies GenericTable's required
        // `Update` field structurally, while making `.update(...)` with
        // any real column unusable at the type level too.
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_organization_member: {
        Args: { target_org_id: string };
        Returns: boolean;
      };
      has_organization_role: {
        Args: { target_org_id: string; role_name: string };
        Returns: boolean;
      };
    };
  };
};
