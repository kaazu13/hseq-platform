"use server";

import { revalidatePath } from "next/cache";
import { redirect, forbidden } from "next/navigation";
import { requireAnyRole, getUserRoleNames } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isUniqueViolation, isRlsViolation, isRaisedException } from "@/lib/supabase/errors";
import type { RoleName } from "@/modules/companies/types";
import { EMPLOYEE_WRITE_ROLES, assignableRoleNamesFor } from "./permissions";
import {
  createEmployeeFormSchema,
  employeeFormSchema,
  endEmploymentFormSchema,
  rehireFormSchema,
  type CreateEmployeeFormInput,
  type EmployeeFormInput,
  type EndEmploymentFormInput,
  type RehireFormInput,
} from "./validation";
import { getEmployee, listAllRoles } from "./queries";
import type { Employee } from "./types";
import { parseEmployeeImportWorkbook, MAX_IMPORT_FILE_SIZE_BYTES, type ImportPreview, type ImportRow } from "./import";

/**
 * Server Functions for the employees domain — follow the fixed recipe in
 * docs/API_CONVENTIONS.md §3. `companyId` is an explicit parameter
 * (not derived from a session claim) per the deviation documented in
 * lib/auth/session.ts's header comment: there is no Custom Access Token
 * Auth Hook configured yet, so every one of these re-verifies membership
 * and role for the SPECIFIC company passed in, live, every call.
 */

/**
 * Employee numbers are always generated in Postgres (`next_employee_number()`
 * — supabase/migrations/20260726100100_employee_numbering.sql), never
 * accepted as input — see that migration's comment for the concurrency-
 * safety rationale. This is the one call site; `createEmployee` below is
 * the only thing that ever needs a fresh number.
 */
async function allocateEmployeeNumber(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
): Promise<ActionResult<string>> {
  const { data, error } = await supabase.rpc("next_employee_number", { target_org_id: companyId });

  if (error || !data) {
    if (error && isRlsViolation(error)) {
      forbidden();
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't assign an employee number. Try again." } };
  }

  return { ok: true, data };
}

export async function createEmployee(
  companyId: string,
  input: CreateEmployeeFormInput,
): Promise<ActionResult<{ employeeId: string; employeeNumber: string }>> {
  const { user } = await requireAnyRole(companyId, EMPLOYEE_WRITE_ROLES);

  const parsed = createEmployeeFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) },
    };
  }

  const supabase = await createClient();

  const numberResult = await allocateEmployeeNumber(supabase, companyId);
  if (!numberResult.ok) {
    return numberResult;
  }
  const employeeNumber = numberResult.data;

  const { data, error } = await supabase
    .from("employees")
    .insert({
      company_id: companyId,
      employee_number: employeeNumber,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      work_email: parsed.data.workEmail ?? null,
      phone: parsed.data.phone ?? null,
      position_title: parsed.data.positionTitle ?? null,
      // Always 'active' — a newly created employee is, by definition, on
      // their first (open) employment period. Not a form field anymore;
      // see validation.ts's sharedEmployeeFields comment. The
      // employees_create_initial_period trigger (same migration as the
      // column lockdown below) creates that first period from start_date
      // in the same transaction.
      employment_status: "active",
      birth_date: parsed.data.birthDate ?? null,
      start_date: parsed.data.startDate ?? null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id, employee_number")
    .single();

  if (error || !data) {
    if (error && isUniqueViolation(error)) {
      return {
        ok: false,
        error: { code: "conflict", message: "That employee number was just taken. Try again." },
      };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't create the employee. Try again." } };
  }

  await supabase.from("audit_events").insert({
    company_id: companyId,
    actor_user_id: user.id,
    action: "create",
    entity_type: "employee",
    entity_id: data.id,
    changes: {
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      employee_number: data.employee_number,
    },
  });

  revalidatePath("/employees");
  redirect(`/employees/${encodeURIComponent(data.employee_number)}`);
}

/**
 * Creates an employee record AND links it to an existing company
 * member's login account in one step (`profile_id` set at insert time,
 * rather than the separate create-then-`linkEmployeeToProfile` sequence)
 * — used by the /admin/members page for a member who is an active
 * company member but has no employee record yet (a real onboarding
 * gap this milestone found: a membership/role can exist with zero linked
 * employee record, which is exactly why that member showed up with no
 * assignable projects anywhere in the app). Unlike `createEmployee`, this
 * does NOT redirect — the admin page stays on its own list.
 */
export async function createEmployeeForMember(companyId: string, profileId: string, input: CreateEmployeeFormInput): Promise<ActionResult<{ employeeId: string; employeeNumber: string }>> {
  const { user } = await requireAnyRole(companyId, EMPLOYEE_WRITE_ROLES);

  const parsed = createEmployeeFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const supabase = await createClient();

  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("id")
    .eq("company_id", companyId)
    .eq("user_id", profileId)
    .eq("status", "active")
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) {
    return { ok: false, error: { code: "validation_error", message: "That account has no active membership in this company." } };
  }

  const { data: alreadyLinked, error: alreadyLinkedError } = await supabase.from("employees").select("id").eq("company_id", companyId).eq("profile_id", profileId).maybeSingle();
  if (alreadyLinkedError) throw alreadyLinkedError;
  if (alreadyLinked) {
    return { ok: false, error: { code: "conflict", message: "This account already has a linked employee record." } };
  }

  const numberResult = await allocateEmployeeNumber(supabase, companyId);
  if (!numberResult.ok) {
    return numberResult;
  }
  const employeeNumber = numberResult.data;

  const { data, error } = await supabase
    .from("employees")
    .insert({
      company_id: companyId,
      profile_id: profileId,
      employee_number: employeeNumber,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      work_email: parsed.data.workEmail ?? null,
      phone: parsed.data.phone ?? null,
      position_title: parsed.data.positionTitle ?? null,
      employment_status: "active",
      birth_date: parsed.data.birthDate ?? null,
      start_date: parsed.data.startDate ?? null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id, employee_number")
    .single();

  if (error || !data) {
    if (error && isUniqueViolation(error)) {
      return { ok: false, error: { code: "conflict", message: "That employee number or linked account was just taken. Try again." } };
    }
    if (error && isRlsViolation(error)) {
      forbidden();
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't create the employee record. Try again." } };
  }

  await supabase.from("audit_events").insert({
    company_id: companyId,
    actor_user_id: user.id,
    action: "create",
    entity_type: "employee",
    entity_id: data.id,
    changes: { first_name: parsed.data.firstName, last_name: parsed.data.lastName, employee_number: data.employee_number, profile_linked: profileId },
  });

  revalidatePath("/admin/members");
  revalidatePath(`/employees/${encodeURIComponent(data.employee_number)}`);
  return { ok: true, data: { employeeId: data.id, employeeNumber: data.employee_number } };
}

export async function updateEmployee(
  companyId: string,
  employeeId: string,
  input: EmployeeFormInput,
): Promise<ActionResult<null>> {
  const { user } = await requireAnyRole(companyId, EMPLOYEE_WRITE_ROLES);

  const parsed = employeeFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) },
    };
  }

  const existing = await getEmployee(companyId, employeeId);
  if (!existing) {
    return { ok: false, error: { code: "not_found", message: "Employee not found." } };
  }

  // employee_number is deliberately absent here — it is immutable once
  // assigned (see prevent_employee_number_change(), same migration as
  // above), and this schema/payload has no field for it at all, so there
  // is no code path in this function that could send a changed value even
  // by accident. employment_status/start_date/end_date are likewise absent
  // — as of the Employment Lifecycle milestone they're owned exclusively
  // by employee_employment_periods (see endEmployment/rehireEmployee
  // below) and are no longer directly UPDATE-able by `authenticated` at
  // the database level (supabase/migrations/20260727090000_employment_periods.sql
  // §7) — sending them here would fail the UPDATE outright, not just be
  // redundant.
  const updatePayload: Partial<Employee> = {
    first_name: parsed.data.firstName,
    last_name: parsed.data.lastName,
    work_email: parsed.data.workEmail ?? null,
    phone: parsed.data.phone ?? null,
    position_title: parsed.data.positionTitle ?? null,
    birth_date: parsed.data.birthDate ?? null,
  };

  const changes: Record<string, { from: string | null; to: string | null }> = {};
  for (const key of Object.keys(updatePayload) as (keyof Employee)[]) {
    const nextValue = updatePayload[key] as string | null;
    const previousValue = existing[key] as string | null;
    if (previousValue !== nextValue) {
      changes[key] = { from: previousValue, to: nextValue };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ ...updatePayload, updated_by: user.id })
    .eq("company_id", companyId)
    .eq("id", employeeId);

  if (error) {
    return { ok: false, error: { code: "server_error", message: "Couldn't save changes. Try again." } };
  }

  if (Object.keys(changes).length > 0) {
    await supabase.from("audit_events").insert({
      company_id: companyId,
      actor_user_id: user.id,
      action: "update",
      entity_type: "employee",
      entity_id: employeeId,
      changes,
    });
  }

  revalidatePath("/employees");
  revalidatePath(`/employees/${encodeURIComponent(existing.employee_number)}`);
  redirect(`/employees/${encodeURIComponent(existing.employee_number)}`);
}

/**
 * Soft-archives an employee: `archived_at` is stamped — this is the one
 * and only signal for "is this employee record archived," per the
 * correction report (`account_status` is a separate, independent
 * account/access lifecycle value that must stay decoupled from record
 * archival). `account_status` is still additionally set to `'archived'`
 * here because that remains part of today's lifecycle convention, but
 * nothing anywhere reads `account_status` to decide archive state — see
 * `archived_at !== null` checks in modules/employees/components/
 * employee-table.tsx and app/(app)/employees/[employeeNumber]/page.tsx.
 * The row stays in the database forever (no DELETE policy exists on
 * `employees` at all — see supabase/migrations/20260725091100_role_helper_and_employees_rls.sql).
 * Does not touch any linked auth user, profile, membership, or role
 * assignment — those are explicitly out of scope for this milestone. See
 * docs/PRODUCT_REQUIREMENTS.md §11 for the documented (not implemented)
 * future rule that archiving a linked employee should only affect this
 * company's access, never the person's global login.
 */
export async function archiveEmployee(companyId: string, employeeId: string): Promise<ActionResult<null>> {
  const { user } = await requireAnyRole(companyId, EMPLOYEE_WRITE_ROLES);

  const existing = await getEmployee(companyId, employeeId);
  if (!existing) {
    return { ok: false, error: { code: "not_found", message: "Employee not found." } };
  }

  if (existing.profile_id === user.id) {
    return {
      ok: false,
      error: { code: "forbidden", message: "You can't archive your own employee record here." },
    };
  }

  if (existing.archived_at !== null) {
    return { ok: true, data: null };
  }

  const archivedAt = new Date().toISOString();
  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ account_status: "archived", archived_at: archivedAt, updated_by: user.id })
    .eq("company_id", companyId)
    .eq("id", employeeId);

  if (error) {
    return { ok: false, error: { code: "server_error", message: "Couldn't archive the employee. Try again." } };
  }

  await supabase.from("audit_events").insert({
    company_id: companyId,
    actor_user_id: user.id,
    action: "archive",
    entity_type: "employee",
    entity_id: employeeId,
    changes: {
      archived_at: { from: existing.archived_at, to: archivedAt },
      account_status: { from: existing.account_status, to: "archived" },
    },
  });

  revalidatePath("/employees");
  revalidatePath(`/employees/${encodeURIComponent(existing.employee_number)}`);
  return { ok: true, data: null };
}

/**
 * Restores an archived employee: clears `archived_at` — the authoritative
 * un-archive signal, mirroring `archiveEmployee` above — and resets
 * `account_status` to `'draft'` as the required fallback, since no
 * "status before archive" is stored anywhere (storing/restoring a richer
 * previous state is explicitly optional and left for a future milestone).
 * The employee's UUID, employee_number, and every other field are
 * untouched. Does not create or activate an auth user and does not send
 * an invitation — account activation remains entirely out of scope for
 * this milestone, restored or not.
 */
export async function restoreEmployee(companyId: string, employeeId: string): Promise<ActionResult<null>> {
  const { user } = await requireAnyRole(companyId, EMPLOYEE_WRITE_ROLES);

  const existing = await getEmployee(companyId, employeeId);
  if (!existing) {
    return { ok: false, error: { code: "not_found", message: "Employee not found." } };
  }

  if (existing.archived_at === null) {
    return { ok: true, data: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ account_status: "draft", archived_at: null, updated_by: user.id })
    .eq("company_id", companyId)
    .eq("id", employeeId);

  if (error) {
    return { ok: false, error: { code: "server_error", message: "Couldn't restore the employee. Try again." } };
  }

  await supabase.from("audit_events").insert({
    company_id: companyId,
    actor_user_id: user.id,
    action: "restore",
    entity_type: "employee",
    entity_id: employeeId,
    changes: {
      archived_at: { from: existing.archived_at, to: null },
      account_status: { from: existing.account_status, to: "draft" },
    },
  });

  revalidatePath("/employees");
  revalidatePath(`/employees/${encodeURIComponent(existing.employee_number)}`);
  return { ok: true, data: null };
}

/**
 * Closes an employee's current, open employment period — the "ending
 * employment" action. Does NOT touch `archived_at`/`account_status`;
 * archiving/restoring a record and ending/starting its employment are
 * deliberately independent signals (see docs/PRODUCT_REQUIREMENTS.md §5.3
 * and the Role Catalogue & Permissions correction report this milestone
 * follows the same reasoning from). `employees.employment_status`/
 * `end_date` update themselves via `employee_employment_periods_sync`
 * (supabase/migrations/20260727090000_employment_periods.sql §5) — this
 * function only ever writes to `employee_employment_periods`.
 */
export async function endEmployment(
  companyId: string,
  employeeId: string,
  input: EndEmploymentFormInput,
): Promise<ActionResult<null>> {
  const { user } = await requireAnyRole(companyId, EMPLOYEE_WRITE_ROLES);

  const parsed = endEmploymentFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) },
    };
  }

  const employee = await getEmployee(companyId, employeeId);
  if (!employee) {
    return { ok: false, error: { code: "not_found", message: "Employee not found." } };
  }

  if (employee.profile_id === user.id) {
    return {
      ok: false,
      error: { code: "forbidden", message: "You can't end your own employment here." },
    };
  }

  const supabase = await createClient();

  const { data: openPeriod, error: openPeriodError } = await supabase
    .from("employee_employment_periods")
    .select("id, start_date")
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .is("end_date", null)
    .maybeSingle();

  if (openPeriodError) throw openPeriodError;
  if (!openPeriod) {
    return { ok: false, error: { code: "conflict", message: "This employee has no active employment period to end." } };
  }

  if (parsed.data.endDate < openPeriod.start_date) {
    return {
      ok: false,
      error: { code: "validation_error", message: "End date can't be before the period's start date.", fieldErrors: { endDate: "End date can't be before the period's start date." } },
    };
  }

  const endedAt = new Date().toISOString();
  const { error } = await supabase
    .from("employee_employment_periods")
    .update({
      end_date: parsed.data.endDate,
      end_reason: parsed.data.endReason,
      end_note: parsed.data.endNote ?? null,
      ended_by: user.id,
      ended_at: endedAt,
    })
    .eq("id", openPeriod.id);

  if (error) {
    return { ok: false, error: { code: "server_error", message: "Couldn't end this employment period. Try again." } };
  }

  await supabase.from("audit_events").insert({
    company_id: companyId,
    actor_user_id: user.id,
    action: "end_employment",
    entity_type: "employee",
    entity_id: employeeId,
    changes: {
      period_id: openPeriod.id,
      end_date: parsed.data.endDate,
      end_reason: parsed.data.endReason,
      end_note: parsed.data.endNote ?? null,
    },
  });

  revalidatePath("/employees");
  revalidatePath(`/employees/${encodeURIComponent(employee.employee_number)}`);
  return { ok: true, data: null };
}

/**
 * Opens a new employment period for a previously-terminated employee — the
 * "rehire" action. Creates a NEW `employee_employment_periods` row, never a
 * new `employees` row, which is what makes the employee_number, UUID, and
 * every other field on the record carry over unchanged (requirement: an
 * employee number is reused on rehire, never reissued). Does not touch
 * `archived_at`/`account_status` — see `endEmployment`'s comment above for
 * why those stay independent.
 */
export async function rehireEmployee(
  companyId: string,
  employeeId: string,
  input: RehireFormInput,
): Promise<ActionResult<null>> {
  const { user } = await requireAnyRole(companyId, EMPLOYEE_WRITE_ROLES);

  const parsed = rehireFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) },
    };
  }

  const employee = await getEmployee(companyId, employeeId);
  if (!employee) {
    return { ok: false, error: { code: "not_found", message: "Employee not found." } };
  }

  const supabase = await createClient();

  const { data: openPeriod, error: openPeriodError } = await supabase
    .from("employee_employment_periods")
    .select("id")
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .is("end_date", null)
    .maybeSingle();

  if (openPeriodError) throw openPeriodError;
  if (openPeriod) {
    return { ok: false, error: { code: "conflict", message: "This employee is already employed — nothing to rehire." } };
  }

  const { data: newPeriod, error } = await supabase
    .from("employee_employment_periods")
    .insert({
      company_id: companyId,
      employee_id: employeeId,
      start_date: parsed.data.startDate,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !newPeriod) {
    if (error && isRlsViolation(error)) {
      forbidden();
    }
    return {
      ok: false,
      error: {
        code: "conflict",
        message: "Couldn't rehire this employee — the start date may be before their last employment period ended.",
      },
    };
  }

  await supabase.from("audit_events").insert({
    company_id: companyId,
    actor_user_id: user.id,
    action: "rehire",
    entity_type: "employee",
    entity_id: employeeId,
    changes: { period_id: newPeriod.id, start_date: parsed.data.startDate },
  });

  revalidatePath("/employees");
  revalidatePath(`/employees/${encodeURIComponent(employee.employee_number)}`);
  return { ok: true, data: null };
}

/**
 * Assigns an existing company role to the membership backing a linked
 * employee. `roleId` must belong to the fixed v1 catalogue and its NAME
 * must be within `assignableRoleNamesFor()` for the caller (permissions.ts)
 * — checked explicitly below (not just relied on via the UI's `<Select>`
 * filtering, which is convenience only and trivially bypassable by calling
 * this function directly) alongside `membership_roles_insert_managers`,
 * which enforces the same rule at the database level and is the real
 * backstop (docs/API_CONVENTIONS.md §6, "RLS is the backstop, not the only
 * check"). Both checks currently agree by construction (assignableRoleNamesFor
 * mirrors the RLS policy's role list exactly) — the app-layer check exists
 * so the two can never silently drift apart without a visible, immediate
 * `forbidden()` here rather than depending solely on the RLS insert failing.
 */
export async function assignEmployeeRole(
  companyId: string,
  employeeId: string,
  membershipId: string,
  roleId: string,
): Promise<ActionResult<null>> {
  const { user } = await requireAnyRole(companyId, EMPLOYEE_WRITE_ROLES);

  const employee = await getEmployee(companyId, employeeId);
  if (!employee) {
    return { ok: false, error: { code: "not_found", message: "Employee not found." } };
  }

  const supabase = await createClient();

  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("id, user_id")
    .eq("id", membershipId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership || membership.user_id !== employee.profile_id) {
    return { ok: false, error: { code: "not_found", message: "This employee has no matching company membership." } };
  }

  const { data: role, error: roleError } = await supabase.from("roles").select("id, name").eq("id", roleId).maybeSingle();
  if (roleError) throw roleError;
  if (!role) {
    return { ok: false, error: { code: "not_found", message: "That role doesn't exist." } };
  }

  const actorRoleNames = await getUserRoleNames(companyId);
  if (!assignableRoleNamesFor(actorRoleNames, [role.name as RoleName]).includes(role.name as RoleName)) {
    forbidden();
  }

  const { error: insertError } = await supabase.from("membership_roles").insert({
    company_id: companyId,
    membership_id: membershipId,
    role_id: roleId,
    created_by: user.id,
  });

  if (insertError) {
    if (isUniqueViolation(insertError)) {
      return { ok: true, data: null };
    }
    if (isRlsViolation(insertError)) {
      forbidden();
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't assign that role. Try again." } };
  }

  await supabase.from("audit_events").insert({
    company_id: companyId,
    actor_user_id: user.id,
    action: "update",
    entity_type: "employee",
    entity_id: employeeId,
    changes: { role_assigned: role.name as RoleName },
  });

  revalidatePath(`/employees/${encodeURIComponent(employee.employee_number)}`);
  return { ok: true, data: null };
}

/**
 * Links an existing employee record to a login account (`employees.profile_id`)
 * — the gap noted in that column's own comment
 * (supabase/migrations/20260725091000_employees.sql: "if this is ever set
 * by a future activation flow, that flow must validate the referenced
 * profile has an ACTIVE company_memberships row for this same
 * company_id"). This is that flow's first implementation. Column-level
 * grants already permit this write today (no REVOKE targets `profile_id`),
 * so this is a normal RLS-enforced Server Function, not a privileged
 * bypass — gated by the same EMPLOYEE_WRITE_ROLES as every other employee
 * mutation.
 *
 * Refuses to overwrite an existing link (the employee must be unlinked
 * first — no unlink action exists yet, deliberately: this milestone only
 * needs to ADD the first link for an owner-account onboarding gap, not a
 * general re-linking workflow) and refuses to link a profile with no
 * ACTIVE membership in this company (the exact validation the
 * column's original comment called for). The partial unique index
 * `employees_company_id_profile_id_key`
 * (20260804092000_employee_profile_link_uniqueness.sql) is the database-level
 * backstop against linking the same profile to two employee rows in one
 * company.
 */
export async function linkEmployeeToProfile(companyId: string, employeeId: string, profileId: string): Promise<ActionResult<null>> {
  const { user } = await requireAnyRole(companyId, EMPLOYEE_WRITE_ROLES);

  const employee = await getEmployee(companyId, employeeId);
  if (!employee) {
    return { ok: false, error: { code: "not_found", message: "Employee not found." } };
  }
  if (employee.profile_id) {
    return { ok: false, error: { code: "conflict", message: "This employee record is already linked to a login account." } };
  }

  const supabase = await createClient();

  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("id")
    .eq("company_id", companyId)
    .eq("user_id", profileId)
    .eq("status", "active")
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) {
    return { ok: false, error: { code: "validation_error", message: "That account has no active membership in this company yet." } };
  }

  const { error } = await supabase.from("employees").update({ profile_id: profileId, updated_by: user.id }).eq("company_id", companyId).eq("id", employeeId);

  if (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: { code: "conflict", message: "That account is already linked to a different employee record in this company." } };
    }
    if (isRlsViolation(error)) {
      forbidden();
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't link the account. Try again." } };
  }

  await supabase.from("audit_events").insert({
    company_id: companyId,
    actor_user_id: user.id,
    action: "update",
    entity_type: "employee",
    entity_id: employeeId,
    changes: { profile_linked: profileId },
  });

  revalidatePath(`/employees/${encodeURIComponent(employee.employee_number)}`);
  revalidatePath("/admin/members");
  return { ok: true, data: null };
}

/**
 * Removes a role assignment. Unlike an INSERT rejected by RLS (which
 * Postgres errors on), a DELETE whose row fails the policy's `USING` clause
 * simply matches zero rows — no error. That is exactly how the "preserve at
 * least one company_admin" rule (`membership_roles_delete_managers`) shows
 * up here: a zero-row result means either an authorization failure or the
 * last-company_admin guard, so it's reported as a conflict rather than a
 * silent no-op.
 *
 * `membershipRoleId` is cross-checked against `employeeId`'s own membership
 * (mirroring `assignEmployeeRole()`'s equivalent check above) — without
 * this, any caller with EMPLOYEE_WRITE_ROLES could remove a role belonging
 * to a DIFFERENT employee while the audit log (and revalidated page) still
 * attributed the change to `employeeId`. Not a privilege escalation (the
 * caller already has company-wide role-management authority either way), but a
 * real audit-attribution gap — see engineering review finding F1.
 */
export async function removeEmployeeRole(
  companyId: string,
  employeeId: string,
  membershipRoleId: string,
): Promise<ActionResult<null>> {
  const { user } = await requireAnyRole(companyId, EMPLOYEE_WRITE_ROLES);

  const employee = await getEmployee(companyId, employeeId);
  if (!employee) {
    return { ok: false, error: { code: "not_found", message: "Employee not found." } };
  }

  const supabase = await createClient();

  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("id")
    .eq("company_id", companyId)
    .eq("user_id", employee.profile_id ?? "")
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) {
    return { ok: false, error: { code: "not_found", message: "This employee has no matching company membership." } };
  }

  const { data: removed, error } = await supabase
    .from("membership_roles")
    .delete()
    .eq("id", membershipRoleId)
    .eq("company_id", companyId)
    .eq("membership_id", membership.id)
    .select("id, role_id");

  if (error) {
    return { ok: false, error: { code: "server_error", message: "Couldn't remove that role. Try again." } };
  }

  if (!removed || removed.length === 0) {
    return {
      ok: false,
      error: {
        code: "conflict",
        message:
          "That role can't be removed — it may be this company's last company_admin, which must always keep at least one.",
      },
    };
  }

  await supabase.from("audit_events").insert({
    company_id: companyId,
    actor_user_id: user.id,
    action: "update",
    entity_type: "employee",
    entity_id: employeeId,
    changes: { role_removed_id: removed[0].role_id },
  });

  revalidatePath(`/employees/${encodeURIComponent(employee.employee_number)}`);
  return { ok: true, data: null };
}

/**
 * Items 9/10 — bulk employee import, step 1: parse and validate a
 * `.xlsx` upload SERVER-SIDE, returning a preview. Never commits anything
 * — the caller shows this to the user (valid/warning/error counts, an
 * error list) before deciding whether to import. Treats the file as
 * untrusted input: extension/size/row/cell-length caps are all enforced
 * here BEFORE the workbook is even parsed (see modules/employees/import.ts's
 * header comment for the rest of the untrusted-input handling).
 */
export async function previewEmployeeImport(companyId: string, formData: FormData): Promise<ActionResult<ImportPreview>> {
  await requireAnyRole(companyId, EMPLOYEE_WRITE_ROLES);

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: { code: "validation_error", message: "No file was provided." } };
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { ok: false, error: { code: "validation_error", message: "Only .xlsx files are accepted." } };
  }
  if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
    return { ok: false, error: { code: "validation_error", message: `File is too large — the limit is ${Math.round(MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024))} MB.` } };
  }

  const allRoles = await listAllRoles();
  const buffer = await file.arrayBuffer();
  const result = await parseEmployeeImportWorkbook(buffer, allRoles);
  if (!result.ok) {
    return { ok: false, error: { code: "validation_error", message: result.message } };
  }

  return { ok: true, data: result.preview };
}

export type CommitEmployeeImportResult = { rowIndex: number; employeeId: string; employeeNumber: string; invitationId: string | null; invitationToken: string | null }[];

/** Items 9/10, step 2 — commits ONLY the rows the caller has already reviewed (never re-reads the file). All-or-nothing: import_employees_bulk() rolls back entirely if any row fails its own server-side re-validation. */
export async function commitEmployeeImport(companyId: string, projectId: string | null, rows: ImportRow[]): Promise<ActionResult<CommitEmployeeImportResult>> {
  await requireAnyRole(companyId, EMPLOYEE_WRITE_ROLES);

  if (rows.length === 0) {
    return { ok: false, error: { code: "validation_error", message: "No rows to import." } };
  }

  const supabase = await createClient();
  const payload = rows.map((row) => ({ firstName: row.firstName, lastName: row.lastName, email: row.email, phone: row.phone, positionTitle: row.positionTitle, roleName: row.roleName }));
  const { data, error } = await supabase.rpc("import_employees_bulk", { target_company_id: companyId, target_project_id: projectId as string, rows: payload });

  if (error || !data) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't import employees. Try again." } };
  }

  revalidatePath("/employees");
  revalidatePath("/admin/members");
  revalidatePath("/onboarding");
  return {
    ok: true,
    data: data.map((row) => ({ rowIndex: row.row_index, employeeId: row.employee_id, employeeNumber: row.employee_number, invitationId: row.invitation_id, invitationToken: row.invitation_token })),
  };
}
