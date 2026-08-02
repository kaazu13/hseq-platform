"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { SCAFFOLD_TYPES, SCAFFOLD_TYPE_LABELS, SCAFFOLD_STATUSES, SCAFFOLD_STATUS_LABELS } from "@/modules/scaffolds/types";
import type { Project } from "@/modules/projects/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FILTER_KEYS = ["scfWorkArea", "scfProjectId", "scfScaffoldType", "scfStatus"] as const;

/**
 * The Safety Overview's "Recent scaffolds" filter bar — `scf*`-prefixed
 * params targeting `/safety-overview`, same reasoning as
 * modules/observations/components/safety-overview-observation-filters.tsx:
 * a direct reuse of ScaffoldFilters would push navigations to `/scaffolds`
 * and collide with the LMRA/Observations sections' own unprefixed params
 * on this same page.
 */
export function SafetyOverviewScaffoldFilters({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const urlWorkArea = searchParams.get("scfWorkArea") ?? "";
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
    searchDebounceRef.current = setTimeout(() => setParam("scfWorkArea", value), 300);
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

      <Select value={searchParams.get("scfProjectId") ?? "all"} onValueChange={(value) => setParam("scfProjectId", value)}>
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

      <Select value={searchParams.get("scfScaffoldType") ?? "all"} onValueChange={(value) => setParam("scfScaffoldType", value)}>
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

      <Select value={searchParams.get("scfStatus") ?? "all"} onValueChange={(value) => setParam("scfStatus", value)}>
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
