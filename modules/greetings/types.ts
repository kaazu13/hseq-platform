import type { Database } from "@/types/database";
import { GREETING_TYPE_LABELS, type GreetingType } from "@/lib/greetings";

export type CompanyGreetingSetting = Database["public"]["Tables"]["company_greeting_settings"]["Row"];

export { GREETING_TYPE_LABELS };
export type { GreetingType };
