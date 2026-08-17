import { createClient } from "@/lib/supabase/server";
import type { CompanyGreetingSetting } from "./types";

/** All 4 greeting-type settings for a company — always exactly 4 rows (seeded automatically at company creation, see the migration's seed_default_greeting_settings() trigger + one-time backfill). */
export async function listGreetingSettings(companyId: string): Promise<CompanyGreetingSetting[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("company_greeting_settings").select("*").eq("company_id", companyId).order("greeting_type", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
