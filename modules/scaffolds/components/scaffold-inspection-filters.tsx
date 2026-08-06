"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { SCAFFOLD_INSPECTION_STATUSES, SCAFFOLD_INSPECTION_STATUS_LABELS } from "@/modules/scaffolds/types";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** URL-search-param-driven status filter for the project-wide Scaffold Inspections list — same pattern as modules/scaffolds/components/scaffold-filters.tsx, narrowed to the one filter this list needs. */
export function ScaffoldInspectionFilters({ basePath }: { basePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function setStatus(value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === "all") params.delete("status");
    else params.set("status", value);
    startTransition(() => {
      router.push(`${basePath}?${params.toString()}`);
    });
  }

  const hasActiveFilter = Boolean(searchParams.get("status"));

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Select value={searchParams.get("status") ?? "all"} onValueChange={setStatus}>
        <SelectTrigger className="w-full sm:w-48" aria-label="Filter by status">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {SCAFFOLD_INSPECTION_STATUSES.map((value) => (
            <SelectItem key={value} value={value}>
              {SCAFFOLD_INSPECTION_STATUS_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilter && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            startTransition(() => {
              router.push(basePath);
            })
          }
        >
          <X />
          Clear filters
        </Button>
      )}

      {isPending && <span className="text-xs text-muted-foreground">Updating…</span>}
    </div>
  );
}
