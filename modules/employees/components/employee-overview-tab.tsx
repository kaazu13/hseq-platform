import type { Employee } from "@/modules/employees/types";
import { AccountStatusBadge, EmploymentStatusBadge } from "@/modules/employees/components/status-badges";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

/** Read-only summary of every column the milestone specifies for the Overview tab. */
export function EmployeeOverviewTab({ employee }: { employee: Employee }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Employee number" value={<span className="font-mono">{employee.employee_number}</span>} />
      <Field label="Work email" value={employee.work_email ?? "—"} />
      <Field label="Phone" value={employee.phone ?? "—"} />
      <Field label="Birth date" value={formatDate(employee.birth_date)} />
      <Field label="Start date" value={formatDate(employee.start_date)} />
      <Field label="End date" value={formatDate(employee.end_date)} />
      <Field label="Employment status" value={<EmploymentStatusBadge status={employee.employment_status} />} />
      <Field label="Account status" value={<AccountStatusBadge status={employee.account_status} />} />
      <Field
        label="Account / profile linkage"
        value={employee.profile_id ? "Linked to a platform account" : "No account — record only"}
      />
      <Field label="Created" value={formatTimestamp(employee.created_at)} />
      <Field label="Last updated" value={formatTimestamp(employee.updated_at)} />
      {employee.archived_at && <Field label="Archived" value={formatTimestamp(employee.archived_at)} />}
    </div>
  );
}
