import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Rendered when `forbidden()` (next/navigation) is called anywhere in the
 * tree — "signed in but not permitted" (HTTP 403). See docs/ARCHITECTURE.md
 * §5. Triggered today by `requireCompanyMembership()`/`requireRole()`
 * (lib/auth/session.ts) when a user isn't an active member of the
 * company a page/action targets.
 */
export default function ForbiddenPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-muted">
        <ShieldAlert className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Access denied</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          You&apos;re signed in, but you don&apos;t have permission to view this page.
        </p>
      </div>
      <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/dashboard" />}>
        Back to dashboard
      </Button>
    </main>
  );
}
