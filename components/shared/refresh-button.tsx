"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Part 6 (Data Freshness), RULE 3: a visible manual refresh control for
 * operational list/dashboard pages — a fallback/QoL affordance, never the
 * primary correctness mechanism (RULE 1's post-mutation `revalidatePath` +
 * `router.refresh()` calls, already used throughout this codebase's Server
 * Actions, are that). Re-runs the current Server Component tree in place —
 * preserves the URL (filters/pagination/mode stay exactly as they are) and
 * shows a spinning-icon loading state while pending. `useTransition` (not a
 * separate boolean) also guards against double-submission: a second click
 * while `isPending` is already true just re-enters the same pending
 * transition rather than stacking a second `router.refresh()` call.
 */
export function RefreshButton({ className }: { className?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
      className={cn("print:hidden", className)}
    >
      <RefreshCw className={isPending ? "animate-spin" : undefined} />
      Refresh
    </Button>
  );
}
