"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { LMRA_STATUSES, LMRA_STATUS_LABELS } from "@/modules/lmra/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FILTER_KEYS = ["workArea", "status", "dateFrom", "dateTo"] as const;

/**
 * URL-search-param-driven filters for the LMRA list — same pattern as
 * modules/employees/components/employee-filters.tsx (see that file's
 * header comment for the controlled-input rationale). Covers work area,
 * status, and date. No project selector — item 7's fix: the project is
 * always the caller's active project (resolved server-side by the page),
 * never a client-chosen one, and never a raw project id shown to the
 * user. `mode` (My/All LMRAs) is a separate, deliberately un-clearable
 * query param the page itself renders links for — omitted from
 * `FILTER_KEYS` so "Clear filters" resets search/status/date without also
 * bouncing the caller out of whichever list mode they're viewing.
 */
export function LmraFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const urlWorkArea = searchParams.get("workArea") ?? "";
  const [lastUrlWorkArea, setLastUrlWorkArea] = useState(urlWorkArea);
  const [workAreaValue, setWorkAreaValue] = useState(urlWorkArea);

  if (urlWorkArea !== lastUrlWorkArea) {
    setLastUrlWorkArea(urlWorkArea);
    setWorkAreaValue(urlWorkArea);
  }

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "" || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    startTransition(() => {
      router.push(`/lmra?${params.toString()}`);
    });
  }

  function onWorkAreaChange(value: string) {
    setWorkAreaValue(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setParam("workArea", value), 300);
  }

  const hasActiveFilters = FILTER_KEYS.some((key) => Boolean(searchParams.get(key)));

  function clearFilters() {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setWorkAreaValue("");
    const params = new URLSearchParams(searchParams.toString());
    for (const key of FILTER_KEYS) params.delete(key);
    startTransition(() => {
      router.push(`/lmra?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search work area…"
          value={workAreaValue}
          className="pl-8"
          onChange={(event) => onWorkAreaChange(event.target.value)}
          aria-label="Search work area"
        />
      </div>

      <Select value={searchParams.get("status") ?? "all"} onValueChange={(value) => setParam("status", value)}>
        <SelectTrigger className="w-full sm:w-40" aria-label="Filter by status">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {LMRA_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {LMRA_STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Label htmlFor="dateFrom" className="text-sm font-normal text-muted-foreground">
          From
        </Label>
        <Input
          id="dateFrom"
          type="date"
          className="w-40"
          value={searchParams.get("dateFrom") ?? ""}
          onChange={(event) => setParam("dateFrom", event.target.value)}
        />
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="dateTo" className="text-sm font-normal text-muted-foreground">
          To
        </Label>
        <Input
          id="dateTo"
          type="date"
          className="w-40"
          value={searchParams.get("dateTo") ?? ""}
          onChange={(event) => setParam("dateTo", event.target.value)}
        />
      </div>

      {hasActiveFilters && (
        <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
          <X />
          Clear filters
        </Button>
      )}

      {isPending && <span className="text-xs text-muted-foreground">Updating…</span>}
    </div>
  );
}
