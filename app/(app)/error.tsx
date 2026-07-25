"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * Route-level error boundary for app/(app)/**. Next.js requires this to be
 * a Client Component. Per docs/UI_GUIDELINES.md §6: "User-actionable
 * message, not a raw error/stack trace" — the underlying error is only
 * logged to the console (where a real error-reporting hook would live
 * later), never rendered.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <EmptyState
        icon={AlertTriangle}
        title="Something went wrong"
        description="This page ran into an unexpected error. Try again — if it keeps happening, contact your administrator."
        action={
          <Button size="sm" onClick={() => reset()}>
            <RotateCw />
            Try again
          </Button>
        }
        className="flex-1"
      />
    </div>
  );
}
