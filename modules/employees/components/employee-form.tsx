"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { createEmployee, updateEmployee } from "@/modules/employees/actions";
import type { Employee } from "@/modules/employees/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type EmployeeFormProps =
  | { mode: "create"; organizationId: string; employee?: undefined }
  | { mode: "edit"; organizationId: string; employee: Employee };

/**
 * Shared create/edit form for the fields employment lifecycle doesn't own.
 * `startDate` (hire date) is create-only — it seeds the new employee's
 * first employment period (see `create_initial_employment_period()`,
 * supabase/migrations/20260727090000_employment_periods.sql). Employment
 * status, start date, and end date are otherwise NOT editable here as of
 * the Employment Lifecycle milestone — see the employee profile page's
 * "End employment"/"Rehire" actions and the Employment tab's read-only
 * period history instead. Uncontrolled, FormData-based submission rather
 * than one `useState` per field, since there's no need to react to
 * keystrokes here.
 *
 * Deliberately a plain `onSubmit` handler with `event.preventDefault()` —
 * NOT `<form action={handler}>` (the pattern `login-form.tsx` uses, fine
 * for a two-field login form but wrong here). React 19 treats a function
 * passed as a `<form>`'s `action` prop as a host "form action": on every
 * submit, before the action function is even called, React unconditionally
 * resets every uncontrolled field in that form (see `requestFormReset` in
 * react-dom's `startHostTransition`) — regardless of whether the action
 * ultimately succeeds or returns a validation failure. That's invisible on
 * success here (the server action's `redirect()` immediately navigates
 * away and unmounts the form), but on a validation failure the page stays
 * up, so the reset is exactly what wiped every already-typed field
 * alongside the error message. A plain `onSubmit` event handler never goes
 * through that host-action code path, so nothing resets the DOM out from
 * under the user — the browser leaves every field exactly as typed unless
 * this component's own code changes it.
 */
export function EmployeeForm({ mode, organizationId, employee }: EmployeeFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    const shared = {
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      workEmail: String(formData.get("workEmail") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      positionTitle: String(formData.get("positionTitle") ?? ""),
      birthDate: String(formData.get("birthDate") ?? ""),
    };

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createEmployee(organizationId, { ...shared, startDate: String(formData.get("startDate") ?? "") })
          : await updateEmployee(organizationId, employee.id, shared);

      // On success both actions redirect server-side and this component
      // unmounts — a value only ever comes back here on failure.
      if (!result.ok) {
        setFormError(result.error.message);
        setFieldErrors(result.error.fieldErrors ?? {});
      }
    });
  }

  function fieldError(name: string) {
    return fieldErrors[name];
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertCircle />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            name="firstName"
            required
            defaultValue={employee?.first_name}
            aria-invalid={Boolean(fieldError("firstName"))}
          />
          {fieldError("firstName") && <p className="text-sm text-destructive">{fieldError("firstName")}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            name="lastName"
            required
            defaultValue={employee?.last_name}
            aria-invalid={Boolean(fieldError("lastName"))}
          />
          {fieldError("lastName") && <p className="text-sm text-destructive">{fieldError("lastName")}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={mode === "edit" ? "employeeNumberDisplay" : undefined}>Employee number</Label>
          {mode === "edit" ? (
            <Input id="employeeNumberDisplay" value={employee.employee_number} readOnly disabled className="font-mono" />
          ) : (
            <p className="flex h-8 items-center text-sm text-muted-foreground">
              Employee number will be assigned automatically.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workEmail">Work email</Label>
          <Input
            id="workEmail"
            name="workEmail"
            type="email"
            defaultValue={employee?.work_email ?? ""}
            aria-invalid={Boolean(fieldError("workEmail"))}
          />
          {fieldError("workEmail") && <p className="text-sm text-destructive">{fieldError("workEmail")}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={employee?.phone ?? ""}
            aria-invalid={Boolean(fieldError("phone"))}
          />
          {fieldError("phone") && <p className="text-sm text-destructive">{fieldError("phone")}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="positionTitle">Position title</Label>
          <Input
            id="positionTitle"
            name="positionTitle"
            defaultValue={employee?.position_title ?? ""}
            aria-invalid={Boolean(fieldError("positionTitle"))}
          />
          {fieldError("positionTitle") && (
            <p className="text-sm text-destructive">{fieldError("positionTitle")}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="birthDate">Birth date</Label>
          <Input
            id="birthDate"
            name="birthDate"
            type="date"
            defaultValue={employee?.birth_date ?? ""}
            aria-invalid={Boolean(fieldError("birthDate"))}
          />
          {fieldError("birthDate") && <p className="text-sm text-destructive">{fieldError("birthDate")}</p>}
        </div>

        {mode === "create" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="startDate">Hire date</Label>
            <Input id="startDate" name="startDate" type="date" aria-invalid={Boolean(fieldError("startDate"))} />
            {fieldError("startDate") && <p className="text-sm text-destructive">{fieldError("startDate")}</p>}
          </div>
        )}
      </div>

      {mode === "edit" && (
        <p className="text-sm text-muted-foreground">
          Employment status, start date, and end date are managed from the Employment tab on this employee&rsquo;s profile,
          not here.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" /> : null}
          {isPending ? "Saving…" : mode === "create" ? "Add employee" : "Save changes"}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
