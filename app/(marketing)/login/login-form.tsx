"use client";

import { useState, useTransition } from "react";
import { login } from "@/modules/auth/actions";

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
    <form action={onSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="rounded-md border border-current/20 bg-transparent px-3 py-2"
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
        />
        {fieldErrors.email && (
          <p id="email-error" className="text-sm text-red-600">
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-md border border-current/20 bg-transparent px-3 py-2"
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={fieldErrors.password ? "password-error" : undefined}
        />
        {fieldErrors.password && (
          <p id="password-error" className="text-sm text-red-600">
            {fieldErrors.password}
          </p>
        )}
      </div>

      {formError && (
        <p role="alert" className="text-sm text-red-600">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-50"
      >
        {isPending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
