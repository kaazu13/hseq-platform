"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { AUDIT_ACTION_LABELS, type AuditAction } from "@/modules/platform-admin/types";
import type { AdminCompanySearchResult } from "@/modules/platform-admin/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FILTER_KEYS = ["actor", "action", "entityType", "companyId", "dateFrom", "dateTo"] as const;
const ACTIONS = Object.keys(AUDIT_ACTION_LABELS) as AuditAction[];

/** Part 2E — Audit Log filters (actor, action, entity type, company, date range), URL-param-driven pagination convention. Actor is a free-text name/email, resolved server-side to a user id (see app/(app)/platform-admin/audit/page.tsx). */
export function AuditFilters({ companies }: { companies: AdminCompanySearchResult[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [actorValue, setActorValue] = useState(searchParams.get("actor") ?? "");
  const [entityTypeValue, setEntityTypeValue] = useState(searchParams.get("entityType") ?? "");

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === "all") params.delete(key);
    else params.set(key, value);
    params.delete("page");
    startTransition(() => router.push(`/platform-admin/audit?${params.toString()}`));
  }

  function debouncedSetParam(key: string, value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setParam(key, value), 300);
  }

  const hasActiveFilters = FILTER_KEYS.some((key) => Boolean(searchParams.get(key)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            value={actorValue}
            onChange={(event) => {
              setActorValue(event.target.value);
              debouncedSetParam("actor", event.target.value);
            }}
            placeholder="Actor name or email…"
            className="pl-8"
            aria-label="Filter by actor"
          />
        </div>

        <Select value={searchParams.get("action") ?? "all"} onValueChange={(value) => setParam("action", value)}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Filter by action">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {ACTIONS.map((action) => (
              <SelectItem key={action} value={action}>
                {AUDIT_ACTION_LABELS[action]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={entityTypeValue}
          onChange={(event) => {
            setEntityTypeValue(event.target.value);
            debouncedSetParam("entityType", event.target.value);
          }}
          placeholder="Entity type (e.g. company)…"
          className="w-full sm:w-48"
          aria-label="Filter by entity type"
        />

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
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <label htmlFor="audit-date-from" className="text-sm text-muted-foreground">
            From
          </label>
          <Input id="audit-date-from" type="date" className="w-40" defaultValue={searchParams.get("dateFrom") ?? ""} onChange={(event) => setParam("dateFrom", event.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="audit-date-to" className="text-sm text-muted-foreground">
            To
          </label>
          <Input id="audit-date-to" type="date" className="w-40" defaultValue={searchParams.get("dateTo") ?? ""} onChange={(event) => setParam("dateTo", event.target.value)} />
        </div>
        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setActorValue("");
              setEntityTypeValue("");
              startTransition(() => router.push("/platform-admin/audit"));
            }}
          >
            <X />
            Clear filters
          </Button>
        )}
        {isPending && <span className="text-xs text-muted-foreground">Updating…</span>}
      </div>
    </div>
  );
}
