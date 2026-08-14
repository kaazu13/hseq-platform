"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { acceptInvitation, signUpAndAcceptInvitation } from "@/modules/invitations/actions";
import { logout } from "@/modules/auth/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AcceptInviteFormProps = {
  token: string;
  invitedEmail: string;
  isAuthenticated: boolean;
  authenticatedEmail: string | null;
};

/** Items 16/17 — three states: no session yet (sign up), signed in as the WRONG account (mismatch, must sign out first), or signed in as the right one (a single confirm). */
export function AcceptInviteForm({ token, invitedEmail, isAuthenticated, authenticatedEmail }: AcceptInviteFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptInvitation(token);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  function handleSignOut() {
    startTransition(async () => {
      const result = await logout();
      if (!result.ok) setError(result.error.message);
    });
  }

  function handleSignUp() {
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await signUpAndAcceptInvitation(token, invitedEmail, password);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      if ("needsEmailConfirmation" in result.data) {
        setNeedsConfirmation(true);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  if (needsConfirmation) {
    return (
      <Alert>
        <AlertDescription>Check your email to confirm your account, then come back to this link to finish joining.</AlertDescription>
      </Alert>
    );
  }

  if (isAuthenticated && authenticatedEmail?.toLowerCase() !== invitedEmail.toLowerCase()) {
    return (
      <div className="flex flex-col gap-3">
        <Alert variant="destructive">
          <AlertDescription>
            You&apos;re signed in as {authenticatedEmail}, but this invitation was sent to {invitedEmail}. Sign out and use the invited account instead.
          </AlertDescription>
        </Alert>
        <Button type="button" variant="outline" className="w-full" disabled={isPending} onClick={handleSignOut}>
          Sign out
        </Button>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="flex flex-col gap-3">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="button" disabled={isPending} onClick={handleAccept} className="w-full">
          {isPending ? <Loader2 className="animate-spin" /> : null}
          Accept invitation
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="accept-email">Email</Label>
        <Input id="accept-email" type="email" value={invitedEmail} disabled readOnly />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="accept-password">Choose a password</Label>
        <Input id="accept-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
      </div>
      <Button type="button" disabled={isPending} onClick={handleSignUp}>
        {isPending ? <Loader2 className="animate-spin" /> : null}
        Create account & accept
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Already have an account? <Link href="/login" className="underline underline-offset-2">Sign in</Link>, then come back to this link to accept.
      </p>
    </div>
  );
}
