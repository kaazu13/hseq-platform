"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import {
  OBSERVATION_CATEGORIES,
  OBSERVATION_CATEGORY_LABELS,
  OBSERVATION_RISK_LEVELS,
  OBSERVATION_RISK_LEVEL_LABELS,
  OBSERVATION_STATUSES,
  OBSERVATION_STATUS_LABELS,
} from "@/modules/observations/types";
import type { Project } from "@/modules/projects/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FILTER_KEYS = ["obsWorkArea", "obsProjectId", "obsCategory", "obsRiskLevel", "obsStatus", "obsDateFrom", "obsDateTo"] as const;

/**
 * The Safety Overview's "Recent observations" filter bar — same shape as
 * modules/observations/components/observation-filters.tsx, but with every
 * param prefixed `obs*` and targeting `/safety-overview`, not
 * `/observations`. Deliberately a SEPARATE component rather than reusing
 * ObservationFilters directly, for the exact same reason
 * modules/lmra/components/safety-overview-filters.tsx is separate from
 * lmra-filters.tsx: reusing it as-is would (a) push navigations to
 * `/observations` instead of filtering in place, and (b) collide on
 * `projectId`/`workArea`/`status`/`dateFrom`/`dateTo` with the LMRA
 * section's OWN unprefixed filter bar living on this same page.
 * Deliberately omits responsiblePerson/overdueOnly — the milestone's
 * Safety Overview requirement only lists "company, project, area,
 * date, and status" as the filters to respect here, not the full
 * Observations-list filter set.
 */
export function SafetyOverviewObservationFilters({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const urlWorkArea = searchParams.get("obsWorkArea") ?? "";
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
    searchDebounceRef.current = setTimeout(() => setParam("obsWorkArea", value), 300);
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
        <Input placeholder="Search work area…" value={workAreaValue} className="pl-8" onChange={(event) => onWorkAreaChange(event.target.value)} aria-label="Search work area" />
      </div>

      <Select value={searchParams.get("obsProjectId") ?? "all"} onValueChange={(value) => setParam("obsProjectId", value)}>
        <SelectTrigger className="w-full sm:w-44" aria-label="Filter by project">
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

      <Select value={searchParams.get("obsCategory") ?? "all"} onValueChange={(value) => setParam("obsCategory", value)}>
        <SelectTrigger className="w-full sm:w-48" aria-label="Filter by category">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {OBSERVATION_CATEGORIES.map((value) => (
            <SelectItem key={value} value={value}>
              {OBSERVATION_CATEGORY_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("obsRiskLevel") ?? "all"} onValueChange={(value) => setParam("obsRiskLevel", value)}>
        <SelectTrigger className="w-full sm:w-36" aria-label="Filter by risk level">
          <SelectValue placeholder="All risk levels" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All risk levels</SelectItem>
          {OBSERVATION_RISK_LEVELS.map((value) => (
            <SelectItem key={value} value={value}>
              {OBSERVATION_RISK_LEVEL_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("obsStatus") ?? "all"} onValueChange={(value) => setParam("obsStatus", value)}>
        <SelectTrigger className="w-full sm:w-36" aria-label="Filter by status">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {OBSERVATION_STATUSES.map((value) => (
            <SelectItem key={value} value={value}>
              {OBSERVATION_STATUS_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Input type="date" className="w-40" aria-label="From date" value={searchParams.get("obsDateFrom") ?? ""} onChange={(event) => setParam("obsDateFrom", event.target.value)} />
        <span className="text-sm text-muted-foreground">to</span>
        <Input type="date" className="w-40" aria-label="To date" value={searchParams.get("obsDateTo") ?? ""} onChange={(event) => setParam("obsDateTo", event.target.value)} />
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
