/**
 * Server/client-neutral employee-option helpers — deliberately its own
 * module with NO `"use client"` directive, no React import, and no
 * browser APIs, so Server Components can call `toEmployeeOptions()`
 * directly when building props for `EmployeeCombobox`
 * (components/shared/employee-combobox.tsx) without pulling in that
 * component's client bundle. Importing a plain function from a
 * `"use client"`-marked module from a Server Component is invalid in the
 * App Router (the whole module becomes a client reference) — this file
 * exists specifically to give Server Components a safe import target.
 *
 * `EmployeeOption` is a plain serializable object ({value, label,
 * employeeNumber, roleLabel} — all strings or null) so it can also be
 * passed as a prop from a Server Component into a Client Component
 * without a serialization error.
 */

/**
 * A person a caller can be offered as a selectable option — the minimal,
 * safe field set: id, name, employee number, and a role/trade label ONLY
 * when the platform reliably knows one (never fabricated).
 */
export type EmployeeOption = {
  value: string;
  label: string;
  employeeNumber: string | null;
  roleLabel: string | null;
};

/**
 * Converts the common `{id, first_name, last_name, employee_number?}`
 * shape most existing candidate queries already return (e.g.
 * `get_basic_employee_info()`'s BasicEmployee, which has no
 * employee_number by design) into `EmployeeOption[]`. `employeeNumber`/
 * `roleLabel` are simply absent (null) wherever the source query doesn't
 * provide them — never fabricated.
 */
export function toEmployeeOptions<T extends { id: string; first_name: string; last_name: string; employee_number?: string | null }>(rows: T[]): EmployeeOption[] {
  return rows.map((row) => ({ value: row.id, label: `${row.first_name} ${row.last_name}`, employeeNumber: row.employee_number ?? null, roleLabel: null }));
}
