"use client";

import { useTransition } from "react";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { setActiveCompany } from "@/modules/companies/actions";
import type { CompanySummary } from "@/modules/companies/types";

type CompanySwitcherProps = {
  companies: CompanySummary[];
  currentCompanyId: string | null;
};

/**
 * Company switcher — see docs/UI_GUIDELINES.md §4: shown only for
 * users with more than one active membership; for the common
 * single-company case it's invisible (plain text), not a disabled or
 * empty dropdown. Zero-membership case renders nothing here at all — the
 * dashboard's own empty state (components/shared/empty-state.tsx via
 * app/(app)/dashboard/page.tsx) is where that's communicated, not the
 * sidebar chrome.
 */
export function CompanySwitcher({ companies, currentCompanyId }: CompanySwitcherProps) {
  const [isPending, startTransition] = useTransition();

  if (companies.length === 0) {
    return null;
  }

  const current =
    companies.find((company) => company.id === currentCompanyId) ?? companies[0];

  if (companies.length === 1) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium">
            <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{current.name}</span>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  function handleSelect(companyId: string, name: string) {
    if (companyId === current.id) return;
    startTransition(async () => {
      const result = await setActiveCompany(companyId);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`Switched to ${name}`);
    });
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                disabled={isPending}
                className="data-[state=open]:bg-sidebar-accent"
              />
            }
          >
            <Building2 className="size-4" />
            <span className="truncate font-medium">{current.name}</span>
            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {/* Base UI requires Menu.GroupLabel (DropdownMenuLabel) to have a
                Menu.Group (DropdownMenuGroup) ancestor — see
                node_modules/@base-ui/react/docs/react/components/menu.md's
                "Group labels" example, which nests the label and its
                associated items inside the same group. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Companies
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {companies.map((company) => (
                <DropdownMenuItem
                  key={company.id}
                  onClick={() => handleSelect(company.id, company.name)}
                  className="justify-between"
                >
                  <span className="truncate">{company.name}</span>
                  {company.id === current.id ? <Check className="size-4" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
