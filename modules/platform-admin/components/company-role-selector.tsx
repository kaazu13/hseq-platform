"use client";

import { useRouter } from "next/navigation";
import type { AdminCompanySearchResult } from "@/modules/platform-admin/types";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Part 2 Roles & Permissions page — pick which company's custom roles to view/manage, with a small name filter (bounded to 20 results server-side via searchAdminCompanies). */
export function CompanyRoleSelector({ companies, selectedCompanyId, query }: { companies: AdminCompanySearchResult[]; selectedCompanyId: string | null; query: string | null }) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        defaultValue={query ?? ""}
        placeholder="Search companies…"
        className="w-56"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            const value = (event.target as HTMLInputElement).value;
            const params = new URLSearchParams();
            if (value) params.set("q", value);
            if (selectedCompanyId) params.set("companyId", selectedCompanyId);
            router.push(`/platform-admin/roles?${params.toString()}`);
          }
        }}
      />
      <Select
        value={selectedCompanyId ?? ""}
        onValueChange={(value) => {
          const params = new URLSearchParams();
          if (query) params.set("q", query);
          if (value) params.set("companyId", value);
          router.push(`/platform-admin/roles?${params.toString()}`);
        }}
      >
        <SelectTrigger className="w-64" aria-label="Select a company">
          <SelectValue placeholder="Select a company…" />
        </SelectTrigger>
        <SelectContent>
          {companies.map((company) => (
            <SelectItem key={company.id} value={company.id}>
              {company.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
