"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { login } from "@/modules/auth/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Client Component — needs interactivity (pending state, inline field
 * errors) that a Server Component can't provide. Calls the `login` Server
 * Function via useTransition, per docs/API_CONVENTIONS.md §1's documented
 * client-invocation pattern. `login` keeps the plain typed-input signature
 * from docs/API_CONVENTIONS.md §3's example (not a (prevState, formData)
 * useActionState reducer), so it stays directly reusable/testable outside
 * of any particular form.
 */
export function LoginForm() {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function onSubmit(formData: FormData) {
    setFormError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await login({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
      });

      // On success `login` redirects server-side and this component
      // unmounts — we only ever get a value back here on failure.
      if (!result.ok) {
        setFormError(result.error.message);
        setFieldErrors(result.error.fieldErrors ?? {});
      }
    });
  }

  return (
    <form action={onSubmit} className="flex w-full flex-col gap-5" noValidate>
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertCircle />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
        />
        {fieldErrors.email && (
          <p id="email-error" className="text-sm text-destructive">
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={fieldErrors.password ? "password-error" : undefined}
        />
        {fieldErrors.password && (
          <p id="password-error" className="text-sm text-destructive">
            {fieldErrors.password}
          </p>
        )}
      </div>

      <Button type="submit" disabled={isPending} className="mt-1 w-full">
        {isPending ? <Loader2 className="animate-spin" /> : null}
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
