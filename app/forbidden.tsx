import Link from "next/link";

/**
 * Rendered when `forbidden()` (next/navigation) is called anywhere in the
 * tree — "signed in but not permitted" (HTTP 403). See docs/ARCHITECTURE.md
 * §5. Not yet triggered by anything in this milestone (no role checks exist
 * until the M2 role schema lands) but required so the convention is in place
 * before the first Server Function calls forbidden().
 */
export default function ForbiddenPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">403 — Access denied</h1>
      <p className="max-w-md opacity-70">
        You&apos;re signed in, but you don&apos;t have permission to view
        this page.
      </p>
      <Link href="/dashboard" className="underline underline-offset-4">
        Back to dashboard
      </Link>
    </main>
  );
}
