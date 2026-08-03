"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { HSEQ_DOCUMENT_CATEGORIES, HSEQ_DOCUMENT_CATEGORY_LABELS, TOOLBOX_DOCUMENT_STATUSES, TOOLBOX_DOCUMENT_STATUS_LABELS, SUGGESTED_DOCUMENT_LANGUAGES } from "@/modules/toolbox-templates/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FILTER_KEYS = ["search", "category", "language", "status"] as const;

export function ToolboxTemplateFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [searchValue, setSearchValue] = useState(searchParams.get("search") ?? "");

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", "templates");
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

      <Select value={searchParams.get("category") ?? "all"} onValueChange={(value) => setParam("category", value)}>
        <SelectTrigger className="w-full sm:w-56" aria-label="Filter by category">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {HSEQ_DOCUMENT_CATEGORIES.map((value) => (
            <SelectItem key={value} value={value}>
              {HSEQ_DOCUMENT_CATEGORY_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("language") ?? "all"} onValueChange={(value) => setParam("language", value)}>
        <SelectTrigger className="w-full sm:w-40" aria-label="Filter by language">
          <SelectValue placeholder="All languages" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All languages</SelectItem>
          {SUGGESTED_DOCUMENT_LANGUAGES.map((value) => (
            <SelectItem key={value} value={value}>
              {value}
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

      {hasActiveFilters && (
        <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
          <X />
          Clear filters
        </Button>
      )}
    </div>
  );
}
