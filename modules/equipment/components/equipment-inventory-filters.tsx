"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { EQUIPMENT_STATUSES, EQUIPMENT_STATUS_LABELS, EQUIPMENT_CONDITIONS, EQUIPMENT_CONDITION_LABELS } from "@/modules/equipment/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FILTER_KEYS = ["search", "category", "status", "condition", "ownership"] as const;

/** Item 3's search/filter bar — equipment name/type, category, status, condition, plus a company-vs-project ownership toggle (item 15/16). URL-param-driven, same convention as every other list filter bar in this app. */
export function EquipmentInventoryFilters({ categories, projectName }: { categories: string[]; projectName: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const urlSearch = searchParams.get("search") ?? "";
  const [lastUrlSearch, setLastUrlSearch] = useState(urlSearch);
  const [searchValue, setSearchValue] = useState(urlSearch);

  if (urlSearch !== lastUrlSearch) {
    setLastUrlSearch(urlSearch);
    setSearchValue(urlSearch);
  }

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "" || value === "all") params.delete(key);
    else params.set(key, value);
    params.delete("page");
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }

  function onSearchChange(value: string) {
    setSearchValue(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value.trim()) params.set("search", value);
    else params.delete("search");
    params.delete("page");
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }

  const hasActiveFilters = FILTER_KEYS.some((key) => Boolean(searchParams.get(key)));

  function clearFilters() {
    setSearchValue("");
    const params = new URLSearchParams(searchParams.toString());
    for (const key of FILTER_KEYS) params.delete(key);
    params.delete("page");
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search equipment…" value={searchValue} className="pl-8" onChange={(event) => onSearchChange(event.target.value)} aria-label="Search equipment" />
      </div>

      <Select value={searchParams.get("category") ?? "all"} onValueChange={(value) => setParam("category", value)}>
        <SelectTrigger className="w-full sm:w-44" aria-label="Filter by category">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category} value={category}>
              {category}
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
          {EQUIPMENT_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {EQUIPMENT_STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("condition") ?? "all"} onValueChange={(value) => setParam("condition", value)}>
        <SelectTrigger className="w-full sm:w-40" aria-label="Filter by condition">
          <SelectValue placeholder="All conditions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All conditions</SelectItem>
          {EQUIPMENT_CONDITIONS.map((condition) => (
            <SelectItem key={condition} value={condition}>
              {EQUIPMENT_CONDITION_LABELS[condition]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("ownership") ?? "all"} onValueChange={(value) => setParam("ownership", value)}>
        <SelectTrigger className="w-full sm:w-48" aria-label="Filter by ownership">
          <SelectValue placeholder="Company + project" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Company + project stock</SelectItem>
          <SelectItem value="project">{projectName} only</SelectItem>
          <SelectItem value="company">Company-wide only</SelectItem>
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
