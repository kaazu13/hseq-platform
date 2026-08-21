"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { LEAVE_TYPES, LEAVE_TYPE_LABELS } from "@/modules/leave-requests/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FILTER_KEYS = ["employee", "type", "from", "to"] as const;

/** Part 30 — the missing employee-search/date-range/type filters on the existing Holiday/Leave request list (status is already a set of tabs on this same page). URL-param-driven, same convention as EquipmentInventoryFilters. */
export function LeaveRequestFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const urlEmployee = searchParams.get("employee") ?? "";
  const [lastUrlEmployee, setLastUrlEmployee] = useState(urlEmployee);
  const [employeeValue, setEmployeeValue] = useState(urlEmployee);

  if (urlEmployee !== lastUrlEmployee) {
    setLastUrlEmployee(urlEmployee);
    setEmployeeValue(urlEmployee);
  }

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "" || value === "all") params.delete(key);
    else params.set(key, value);
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }

  function onEmployeeChange(value: string) {
    setEmployeeValue(value);
    setParam("employee", value.trim() || null);
  }

  const hasActiveFilters = FILTER_KEYS.some((key) => Boolean(searchParams.get(key)));

  function clearFilters() {
    setEmployeeValue("");
    const params = new URLSearchParams(searchParams.toString());
    for (const key of FILTER_KEYS) params.delete(key);
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search employee…" value={employeeValue} className="pl-8" onChange={(event) => onEmployeeChange(event.target.value)} aria-label="Search by employee" />
      </div>

      <Select value={searchParams.get("type") ?? "all"} onValueChange={(value) => setParam("type", value)}>
        <SelectTrigger className="w-full sm:w-44" aria-label="Filter by type">
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {LEAVE_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {LEAVE_TYPE_LABELS[type]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input type="date" className="w-full sm:w-40" aria-label="From date" value={searchParams.get("from") ?? ""} onChange={(event) => setParam("from", event.target.value)} />
      <Input type="date" className="w-full sm:w-40" aria-label="To date" value={searchParams.get("to") ?? ""} onChange={(event) => setParam("to", event.target.value)} />

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
