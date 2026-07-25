"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Root-level error boundary — covers routes outside app/(app)/**, which has its own. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-muted">
        <AlertTriangle className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          An unexpected error occurred. Try again — if it keeps happening, contact your administrator.
        </p>
      </div>
      <Button size="sm" onClick={() => reset()}>
        <RotateCw />
        Try again
      </Button>
    </main>
  );
}
