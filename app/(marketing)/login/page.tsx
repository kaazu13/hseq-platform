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
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-muted/30 p-6">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <HardHat className="size-5 text-primary" aria-hidden="true" />
        HSEQ Platform
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Sign in</CardTitle>
          <CardDescription>Enter your credentials to access your organization.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
