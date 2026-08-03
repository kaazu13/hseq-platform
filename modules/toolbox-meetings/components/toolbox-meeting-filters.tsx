"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import type { Project } from "@/modules/projects/types";
import { TOOLBOX_DOCUMENT_STATUSES, TOOLBOX_DOCUMENT_STATUS_LABELS } from "@/modules/toolbox-meetings/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FILTER_KEYS = ["search", "projectId", "status", "dateFrom", "dateTo"] as const;

/** URL-search-param-driven filters for the Toolbox Meetings list — same pattern as modules/scaffolds/components/scaffold-filters.tsx. */
export function ToolboxMeetingFilters({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const urlSearch = searchParams.get("search") ?? "";
  const [searchValue, setSearchValue] = useState(urlSearch);

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "" || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/toolbox-meetings?${params.toString()}`);
  }

  function onSearchChange(value: string) {
    setSearchValue(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setParam("search", value), 300);
  }

  const hasActiveFilters = FILTER_KEYS.some((key) => Boolean(searchParams.get(key)));

  function clearFilters() {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setSearchValue("");
    const params = new URLSearchParams(searchParams.toString());
    for (const key of FILTER_KEYS) params.delete(key);
    router.push(`/toolbox-meetings?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search title…" value={searchValue} className="pl-8" onChange={(event) => onSearchChange(event.target.value)} aria-label="Search title" />
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

      <Select value={searchParams.get("status") ?? "all"} onValueChange={(value) => setParam("status", value)}>
        <SelectTrigger className="w-full sm:w-40" aria-label="Filter by status">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {TOOLBOX_DOCUMENT_STATUSES.map((value) => (
            <SelectItem key={value} value={value}>
              {TOOLBOX_DOCUMENT_STATUS_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input type="date" className="w-full sm:w-40" aria-label="From date" value={searchParams.get("dateFrom") ?? ""} onChange={(event) => setParam("dateFrom", event.target.value)} />
      <Input type="date" className="w-full sm:w-40" aria-label="To date" value={searchParams.get("dateTo") ?? ""} onChange={(event) => setParam("dateTo", event.target.value)} />

      {hasActiveFilters && (
        <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
          <X />
          Clear filters
        </Button>
      )}
    </div>
  );
}
