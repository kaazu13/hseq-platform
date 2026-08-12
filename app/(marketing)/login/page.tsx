import { redirect } from "next/navigation";
import { HardHat } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

/**
 * Public login page. Server Component: it only needs to check for an
 * existing session (redirecting straight to the dashboard if so) and
 * render the interactive form — no client-only state of its own.
 */
export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-12 bg-muted/30 p-6 sm:gap-16">
      {/*
       * Phase 20 refinement: branding moved higher, clearly larger than
       * the previous inline `text-sm`/`size-5` treatment, and visually
       * separated from the card below via the parent's own generous
       * `gap` (rather than being stacked immediately on top of it) —
       * "clearly larger... do NOT make it as oversized as the previous
       * mockup." Centered on both axes, same layout on mobile (the
       * column stack + gap scale down naturally at narrow widths).
       */}
      <div className="flex flex-col items-center gap-3 text-center">
        <HardHat className="size-12 text-primary sm:size-14" aria-hidden="true" />
        <span className="text-3xl font-bold tracking-tight sm:text-4xl">HSEQ Platform</span>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Sign in</CardTitle>
          <CardDescription>Enter your credentials to access your company.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
