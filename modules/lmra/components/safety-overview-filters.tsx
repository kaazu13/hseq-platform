"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { LMRA_STATUSES, LMRA_STATUS_LABELS } from "@/modules/lmra/types";
import type { Project } from "@/modules/projects/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FILTER_KEYS = ["workArea", "status", "projectId", "dateFrom", "dateTo"] as const;

/**
 * Safety Overview's filters — same URL-search-param pattern and component
 * shape as modules/lmra/components/lmra-filters.tsx (kept as a distinct
 * component rather than shared, since it targets a different route and this
 * page's filters apply only to the "Recent LMRA activity" section, not the
 * fixed-window stat cards above it — see app/(app)/safety-overview/page.tsx's
 * header comment for why those can't share a date filter with "today"/"this
 * week"/"overdue").
 *
 * "Company" is implicit (the current company context, like every
 * other page). This schema has no "company" concept distinct from
 * company/project — see the milestone report for that disclosure;
 * there is deliberately no fake "company" dropdown here.
 */
export function SafetyOverviewFilters({ projects }: { projects: Project[] }) {
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
      router.push(`/safety-overview?${params.toString()}`);
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
      router.push(`/safety-overview?${params.toString()}`);
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

      <Select value={searchParams.get("projectId") ?? "all"} onValueChange={(value) => setParam("projectId", value)}>
        <SelectTrigger className="w-full sm:w-48" aria-label="Filter by project">
          <SelectValue placeholder="All projects" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All projects</SelectItem>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
