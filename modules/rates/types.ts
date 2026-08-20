import type { Database } from "@/types/database";

export type EmployeeHourlyRate = Database["public"]["Tables"]["employee_hourly_rates"]["Row"];

export type RateHistoryEntry = {
  id: string;
  hourlyRate: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string | null;
  changedByName: string | null;
};
