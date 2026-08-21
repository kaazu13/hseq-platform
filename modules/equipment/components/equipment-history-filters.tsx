"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import type { BasicEmployee } from "@/modules/equipment/types";
import { EQUIPMENT_HISTORY_EVENT_LABELS } from "@/modules/equipment/types";
import type { EquipmentItem } from "@/modules/equipment/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FILTER_KEYS = ["historyItemId", "historyEmployeeId", "historyEvent", "historyFrom", "historyTo"] as const;

/** Part 27 — the History tab's filter bar: item/employee/action/date, URL-param-driven (same convention as EquipmentInventoryFilters), namespaced with a `history` prefix so it never collides with the Inventory tab's own filter params when both are present in the URL across tab switches. */
export function EquipmentHistoryFilters({ items, employees }: { items: EquipmentItem[]; employees: BasicEmployee[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "" || value === "all") params.delete(key);
    else params.set(key, value);
    router.push(`?${params.toString()}`);
  }

  const hasActiveFilters = FILTER_KEYS.some((key) => Boolean(searchParams.get(key)));

  function clearFilters() {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of FILTER_KEYS) params.delete(key);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Select value={searchParams.get("historyItemId") ?? "all"} onValueChange={(value) => setParam("historyItemId", value)}>
        <SelectTrigger className="w-full sm:w-48" aria-label="Filter by item">
          <SelectValue placeholder="All items" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All items</SelectItem>
          {items.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("historyEmployeeId") ?? "all"} onValueChange={(value) => setParam("historyEmployeeId", value)}>
        <SelectTrigger className="w-full sm:w-48" aria-label="Filter by employee">
          <SelectValue placeholder="All employees" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All employees</SelectItem>
          {employees.map((employee) => (
            <SelectItem key={employee.id} value={employee.id}>
              {employee.first_name} {employee.last_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("historyEvent") ?? "all"} onValueChange={(value) => setParam("historyEvent", value)}>
        <SelectTrigger className="w-full sm:w-44" aria-label="Filter by action">
          <SelectValue placeholder="All actions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All actions</SelectItem>
          {Object.entries(EQUIPMENT_HISTORY_EVENT_LABELS).map(([event, label]) => (
            <SelectItem key={event} value={event}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input type="date" className="w-full sm:w-40" aria-label="From date" value={searchParams.get("historyFrom") ?? ""} onChange={(event) => setParam("historyFrom", event.target.value)} />
      <Input type="date" className="w-full sm:w-40" aria-label="To date" value={searchParams.get("historyTo") ?? ""} onChange={(event) => setParam("historyTo", event.target.value)} />

      {hasActiveFilters && (
        <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
          <X />
          Clear filters
        </Button>
      )}
    </div>
  );
}
