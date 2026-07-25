import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
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
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="opacity-70">HSEQ Platform</p>
      </div>
      <LoginForm />
    </main>
  );
}
