import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Part 2 Overview page — a single aggregate stat tile. Purely
 * presentational (the actual numbers all come from bounded COUNT(*)
 * queries in platform_admin_get_overview_stats(), never an unbounded row
 * scan rendered here).
 */
export function StatCard({ label, value, icon: Icon, tone, hint }: { label: string; value: number | string; icon: LucideIcon; tone?: "default" | "warning" | "danger"; hint?: string }) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 pt-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p
            className={cn(
              "text-2xl font-semibold tabular-nums",
              tone === "danger" && "text-destructive",
              tone === "warning" && "text-amber-600 dark:text-amber-500",
            )}
          >
            {value}
          </p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </CardContent>
    </Card>
  );
}
