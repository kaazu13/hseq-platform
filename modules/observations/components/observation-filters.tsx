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
import { EmployeeCombobox, toEmployeeOptions, type EmployeeOption } from "@/components/shared/employee-combobox";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FILTER_KEYS = ["workArea", "projectId", "category", "riskLevel", "status", "responsiblePersonId", "overdueOnly", "dateFrom", "dateTo"] as const;

type ResponsiblePersonOption = { id: string; first_name: string; last_name: string };

/**
 * URL-search-param-driven filters for the Observations list — same pattern
 * as modules/lmra/components/lmra-filters.tsx (see that file's header
 * comment for the controlled-input rationale). Covers this milestone's
 * "filters for project, area, category, risk, status, responsible person,
 * overdue state, and date" requirement — `responsiblePersonId`/
 * `overdueOnly` are cross-table filters resolved via each observation's
 * corrective actions (see modules/observations/queries.ts's
 * resolveObservationIdsByCorrectiveActionFilter).
 */
export function ObservationFilters({ projects, responsiblePersons }: { projects: Project[]; responsiblePersons: ResponsiblePersonOption[] }) {
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
      router.push(`/observations?${params.toString()}`);
    });
  }

  function onWorkAreaChange(value: string) {
    setWorkAreaValue(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setParam("workArea", value), 300);
  }

  const hasActiveFilters = FILTER_KEYS.some((key) => Boolean(searchParams.get(key)));
  const responsiblePersonOptions: EmployeeOption[] = toEmployeeOptions(responsiblePersons);

  function clearFilters() {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setWorkAreaValue("");
    const params = new URLSearchParams(searchParams.toString());
    for (const key of FILTER_KEYS) params.delete(key);
    startTransition(() => {
      router.push(`/observations?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search work area…" value={workAreaValue} className="pl-8" onChange={(event) => onWorkAreaChange(event.target.value)} aria-label="Search work area" />
      </div>

      <Select value={searchParams.get("projectId") ?? "all"} onValueChange={(value) => setParam("projectId", value)}>
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

      <Select value={searchParams.get("category") ?? "all"} onValueChange={(value) => setParam("category", value)}>
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

      <Select value={searchParams.get("riskLevel") ?? "all"} onValueChange={(value) => setParam("riskLevel", value)}>
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

      <Select value={searchParams.get("status") ?? "all"} onValueChange={(value) => setParam("status", value)}>
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

      <div className="w-full sm:w-48">
        <EmployeeCombobox
          aria-label="Filter by corrective action responsible person"
          value={searchParams.get("responsiblePersonId") ?? null}
          onValueChange={(id) => setParam("responsiblePersonId", id)}
          options={responsiblePersonOptions}
          placeholder="Any responsible person"
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="overdueOnly"
          checked={searchParams.get("overdueOnly") === "true"}
          onCheckedChange={(checked) => setParam("overdueOnly", checked ? "true" : null)}
        />
        <Label htmlFor="overdueOnly" className="text-sm font-normal">
          Has overdue action
        </Label>
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="dateFrom" className="text-sm font-normal text-muted-foreground">
          From
        </Label>
        <Input id="dateFrom" type="date" className="w-40" value={searchParams.get("dateFrom") ?? ""} onChange={(event) => setParam("dateFrom", event.target.value)} />
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="dateTo" className="text-sm font-normal text-muted-foreground">
          To
        </Label>
        <Input id="dateTo" type="date" className="w-40" value={searchParams.get("dateTo") ?? ""} onChange={(event) => setParam("dateTo", event.target.value)} />
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
