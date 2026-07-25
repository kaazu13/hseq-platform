import Link from "next/link";

/**
 * Rendered when `unauthorized()` (next/navigation) is called anywhere in the
 * tree — "not signed in" (HTTP 401). See docs/ARCHITECTURE.md §5.
 */
export default function UnauthorizedPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">401 — Sign in required</h1>
      <p className="max-w-md opacity-70">
        You need to sign in to access this page.
      </p>
      <Link href="/login" className="underline underline-offset-4">
        Go to login
      </Link>
    </main>
  );
}
