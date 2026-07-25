import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Rendered when `unauthorized()` (next/navigation) is called anywhere in the
 * tree — "not signed in" (HTTP 401). See docs/ARCHITECTURE.md §5.
 */
export default function UnauthorizedPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-muted">
        <LockKeyhole className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Sign in required</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          You need to sign in to access this page.
        </p>
      </div>
      <Button size="sm" nativeButton={false} render={<Link href="/login" />}>
        Go to login
      </Button>
    </main>
  );
}
