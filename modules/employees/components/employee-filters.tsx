"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { EMPLOYMENT_STATUSES, EMPLOYMENT_STATUS_LABELS, ACCOUNT_STATUS_LABELS } from "@/modules/employees/types";
import type { EmployeeAccountStatus } from "@/modules/employees/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ACCOUNT_STATUSES: EmployeeAccountStatus[] = [
  "draft",
  "invited",
  "pending_activation",
  "active",
  "suspended",
  "archived",
];

const FILTER_KEYS = ["search", "employmentStatus", "accountStatus", "includeArchived"] as const;

/**
 * URL-search-param-driven filters — the list page (a Server Component)
 * reads these back out of `searchParams` and re-queries, so filter state
 * survives reloads/back-forward navigation and never needs client-side
 * fetching (docs/API_CONVENTIONS.md §7). Pagination (`page`/`pageSize`)
 * lives in the same URL but is rendered by the separate
 * components/shared/pagination-bar.tsx — this component only ever touches
 * the four filter keys in `FILTER_KEYS`, resetting `page` back to 1
 * whenever any of them changes (a filter change can shrink or grow the
 * result set, so whatever page the user was on may no longer make sense).
 *
 * The search box is a genuinely CONTROLLED input (`value`, never
 * `defaultValue`) — see the Employee Management Polish milestone's
 * implementation report for the root cause this fixes: passing a
 * `defaultValue` that changes on every render (as `searchParams.get(...)`
 * does whenever the URL changes — typing, clearing, or browser back/
 * forward) is exactly the pattern Base UI's Input warns about
 * ("changing the default value state of an uncontrolled FieldControl
 * after being initialized"). `searchValue` is local state, always a
 * defined string (never `undefined`, so it never flips between
 * controlled/uncontrolled), kept in sync with the URL so browser back/
 * forward and the "Clear filters" button both update what's visibly typed
 * in the box, not just the URL.
 *
 * That resync happens DURING RENDER (comparing against `lastUrlSearch`,
 * React's documented "adjusting state when a prop changes" pattern —
 * https://react.dev/learn/you-might-not-need-an-effect) rather than in a
 * `useEffect`: calling `setState` synchronously from an effect body causes
 * an extra committed render for a value that was already knowable during
 * the current one, which is exactly what `react-hooks/set-state-in-effect`
 * flags.
 */
export function EmployeeFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const urlSearch = searchParams.get("search") ?? "";
  const [lastUrlSearch, setLastUrlSearch] = useState(urlSearch);
  const [searchValue, setSearchValue] = useState(urlSearch);

  if (urlSearch !== lastUrlSearch) {
    setLastUrlSearch(urlSearch);
    setSearchValue(urlSearch);
  }

  /** Sets one filter param, always resetting `page` back to 1 — a filter change invalidates whatever page the user was previously on. */
  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "" || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete("page");
    startTransition(() => {
      router.push(`/employees?${params.toString()}`);
    });
  }

  function onSearchChange(value: string) {
    setSearchValue(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setParam("search", value), 300);
  }

  const hasActiveFilters = FILTER_KEYS.some((key) => Boolean(searchParams.get(key)));

  /** Clears every filter, but keeps `pageSize` — that's a viewing preference, not a filter, per the correction report. */
  function clearFilters() {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setSearchValue("");
    const params = new URLSearchParams(searchParams.toString());
    for (const key of FILTER_KEYS) params.delete(key);
    params.delete("page");
    startTransition(() => {
      router.push(`/employees?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search name, email, or number…"
          value={searchValue}
          className="pl-8"
          onChange={(event) => onSearchChange(event.target.value)}
          aria-label="Search employees"
        />
      </div>

      <Select value={searchParams.get("employmentStatus") ?? "all"} onValueChange={(value) => setParam("employmentStatus", value)}>
        <SelectTrigger className="w-full sm:w-44" aria-label="Filter by employment status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All employment statuses</SelectItem>
          {EMPLOYMENT_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {EMPLOYMENT_STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("accountStatus") ?? "all"} onValueChange={(value) => setParam("accountStatus", value)}>
        <SelectTrigger className="w-full sm:w-44" aria-label="Filter by account status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All account statuses</SelectItem>
          {ACCOUNT_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {ACCOUNT_STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Checkbox
          id="includeArchived"
          checked={searchParams.get("includeArchived") === "true"}
          onCheckedChange={(checked) => setParam("includeArchived", checked ? "true" : null)}
        />
        <Label htmlFor="includeArchived" className="text-sm font-normal">
          Include archived
        </Label>
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
