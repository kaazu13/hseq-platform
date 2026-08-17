/**
 * Task 3 Part 8 — date logic for the automated company-greetings system.
 * Kept in TypeScript (not PL/pgSQL) specifically so the Easter-Sunday
 * calculation is easy to write/test/read — see computeEasterSunday()'s own
 * comment. supabase/migrations/20260901112000_company_greetings.sql's
 * process_company_greetings() RPC takes the result of
 * getDueFixedGreetingTypes() as an explicit parameter rather than
 * reimplementing this in SQL.
 */

export const FIXED_GREETING_TYPES = ["christmas", "new_year", "easter"] as const;
export type FixedGreetingType = (typeof FIXED_GREETING_TYPES)[number];
export type GreetingType = FixedGreetingType | "birthday";

/**
 * Anonymous Gregorian algorithm (a.k.a. Meeus/Jones/Butcher) — the
 * standard, well-known closed-form formula for Easter Sunday in the
 * Gregorian calendar. Returns a UTC Date at midnight for the given year.
 */
export function computeEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function isSameUtcDate(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

/** Which fixed-calendar greeting types (if any) fall on this exact UTC date — birthday is deliberately excluded, it's evaluated per-employee server-side instead. */
export function getDueFixedGreetingTypes(date: Date): FixedGreetingType[] {
  const due: FixedGreetingType[] = [];
  if (date.getUTCMonth() === 11 && date.getUTCDate() === 25) due.push("christmas");
  if (date.getUTCMonth() === 0 && date.getUTCDate() === 1) due.push("new_year");
  if (isSameUtcDate(date, computeEasterSunday(date.getUTCFullYear()))) due.push("easter");
  return due;
}

export const GREETING_TYPE_LABELS: Record<GreetingType, string> = {
  birthday: "Birthday",
  christmas: "Christmas",
  new_year: "New Year",
  easter: "Easter",
};

export const GREETING_PLACEHOLDER_HELP = "Supported placeholders: {{first_name}}, {{last_name}}, {{company_name}}";
