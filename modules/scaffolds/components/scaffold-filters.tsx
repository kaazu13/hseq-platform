"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { SCAFFOLD_TYPES, SCAFFOLD_TYPE_LABELS, SCAFFOLD_STATUSES, SCAFFOLD_STATUS_LABELS } from "@/modules/scaffolds/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FILTER_KEYS = ["workArea", "client", "scaffoldType", "status"] as const;

/**
 * URL-search-param-driven filters for the Scaffold register — same pattern
 * as every other list filter this session (see
 * modules/lmra/components/lmra-filters.tsx's header comment for the
 * controlled-input rationale). No project filter: the canonical scaffold
 * register route (/companies/[companyId]/projects/[projectId]/scaffolds)
 * is itself project-scoped — there is exactly one project's scaffolds to
 * browse here, not a cross-project list to narrow down.
 */
export function ScaffoldFilters({ basePath }: { basePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const urlWorkArea = searchParams.get("workArea") ?? "";
  const [lastUrlWorkArea, setLastUrlWorkArea] = useState(urlWorkArea);
  const [workAreaValue, setWorkAreaValue] = useState(urlWorkArea);
  const urlClient = searchParams.get("client") ?? "";
  const [lastUrlClient, setLastUrlClient] = useState(urlClient);
  const [clientValue, setClientValue] = useState(urlClient);

  if (urlWorkArea !== lastUrlWorkArea) {
    setLastUrlWorkArea(urlWorkArea);
    setWorkAreaValue(urlWorkArea);
  }
  if (urlClient !== lastUrlClient) {
    setLastUrlClient(urlClient);
    setClientValue(urlClient);
  }

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "" || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    startTransition(() => {
      router.push(`${basePath}?${params.toString()}`);
    });
  }

  function onWorkAreaChange(value: string) {
    setWorkAreaValue(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setParam("workArea", value), 300);
  }

  function onClientChange(value: string) {
    setClientValue(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setParam("client", value), 300);
  }

  const hasActiveFilters = FILTER_KEYS.some((key) => Boolean(searchParams.get(key)));

  function clearFilters() {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setWorkAreaValue("");
    setClientValue("");
    const params = new URLSearchParams(searchParams.toString());
    for (const key of FILTER_KEYS) params.delete(key);
    startTransition(() => {
      router.push(`${basePath}?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search work area…" value={workAreaValue} className="pl-8" onChange={(event) => onWorkAreaChange(event.target.value)} aria-label="Search work area" />
      </div>

      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search client…" value={clientValue} className="pl-8" onChange={(event) => onClientChange(event.target.value)} aria-label="Search client" />
      </div>

      <Select value={searchParams.get("scaffoldType") ?? "all"} onValueChange={(value) => setParam("scaffoldType", value)}>
        <SelectTrigger className="w-full sm:w-48" aria-label="Filter by scaffold type">
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {SCAFFOLD_TYPES.map((value) => (
            <SelectItem key={value} value={value}>
              {SCAFFOLD_TYPE_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("status") ?? "all"} onValueChange={(value) => setParam("status", value)}>
        <SelectTrigger className="w-full sm:w-48" aria-label="Filter by status">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {SCAFFOLD_STATUSES.map((value) => (
            <SelectItem key={value} value={value}>
              {SCAFFOLD_STATUS_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
