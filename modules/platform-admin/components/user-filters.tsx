"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { ACCOUNT_STATUS_LABELS } from "@/modules/platform-admin/types";
import { ROLE_NAMES } from "@/modules/companies/types";
import type { AdminCompanySearchResult } from "@/modules/platform-admin/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FILTER_KEYS = ["q", "status", "companyId", "role"] as const;
const ASSIGNABLE_ROLE_NAMES = ROLE_NAMES.filter((name) => name !== "platform_super_admin");

/** Part 2D — Users page search/filter (name/email, account status, company, role), URL-param-driven — same pattern as modules/lmra/components/lmra-filters.tsx. */
export function UserFilters({ companies }: { companies: AdminCompanySearchResult[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const urlQuery = searchParams.get("q") ?? "";
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
  const [queryValue, setQueryValue] = useState(urlQuery);

  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setQueryValue(urlQuery);
  }

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "" || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete("page");
    params.delete("view");
    startTransition(() => {
      router.push(`/platform-admin/users?${params.toString()}`);
    });
  }

  const hasActiveFilters = FILTER_KEYS.some((key) => Boolean(searchParams.get(key)));

  function clearFilters() {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setQueryValue("");
    startTransition(() => {
      router.push("/platform-admin/users");
    });
  }

  function onQueryChange(value: string) {
    setQueryValue(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setParam("q", value), 300);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input value={queryValue} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search by name or email…" className="pl-8" aria-label="Search by name or email" />
      </div>

      <Select value={searchParams.get("status") ?? "all"} onValueChange={(value) => setParam("status", value)}>
        <SelectTrigger className="w-full sm:w-40" aria-label="Filter by account status">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {(Object.keys(ACCOUNT_STATUS_LABELS) as (keyof typeof ACCOUNT_STATUS_LABELS)[]).map((status) => (
            <SelectItem key={status} value={status}>
              {ACCOUNT_STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("companyId") ?? "all"} onValueChange={(value) => setParam("companyId", value)}>
        <SelectTrigger className="w-full sm:w-48" aria-label="Filter by company">
          <SelectValue placeholder="All companies" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All companies</SelectItem>
          {companies.map((company) => (
            <SelectItem key={company.id} value={company.id}>
              {company.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("role") ?? "all"} onValueChange={(value) => setParam("role", value)}>
        <SelectTrigger className="w-full sm:w-44" aria-label="Filter by role">
          <SelectValue placeholder="All roles" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All roles</SelectItem>
          {ASSIGNABLE_ROLE_NAMES.map((role) => (
            <SelectItem key={role} value={role}>
              {role.replace(/_/g, " ")}
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
