import type { Database } from "@/types/database";

export type EmployeeRateRequest = Database["public"]["Tables"]["employee_rate_requests"]["Row"];
export type EmployeeRateRequestStatus = Database["public"]["Enums"]["employee_rate_request_status"];

export const EMPLOYEE_RATE_REQUEST_STATUSES: EmployeeRateRequestStatus[] = ["pending", "approved", "rejected", "withdrawn"];

export const EMPLOYEE_RATE_REQUEST_STATUS_LABELS: Record<EmployeeRateRequestStatus, string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export type EmployeeRateRequestWithEmployee = EmployeeRateRequest & {
  employee: { id: string; first_name: string; last_name: string };
  projectNames: string[];
};
