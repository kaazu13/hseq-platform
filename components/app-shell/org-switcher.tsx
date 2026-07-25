"use client";

import { useTransition } from "react";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
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
import { setActiveOrganization } from "@/modules/organizations/actions";
import type { OrganizationSummary } from "@/modules/organizations/types";

type OrgSwitcherProps = {
  organizations: OrganizationSummary[];
  currentOrganizationId: string | null;
};

/**
 * Organization switcher — see docs/UI_GUIDELINES.md §4: shown only for
 * users with more than one active membership; for the common
 * single-organization case it's invisible (plain text), not a disabled or
 * empty dropdown. Zero-membership case renders nothing here at all — the
 * dashboard's own empty state (components/shared/empty-state.tsx via
 * app/(app)/dashboard/page.tsx) is where that's communicated, not the
 * sidebar chrome.
 */
export function OrgSwitcher({ organizations, currentOrganizationId }: OrgSwitcherProps) {
  const [isPending, startTransition] = useTransition();

  if (organizations.length === 0) {
    return null;
  }

  const current =
    organizations.find((org) => org.id === currentOrganizationId) ?? organizations[0];

  if (organizations.length === 1) {
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

  function handleSelect(organizationId: string, name: string) {
    if (organizationId === current.id) return;
    startTransition(async () => {
      const result = await setActiveOrganization(organizationId);
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
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Organizations
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {organizations.map((org) => (
              <DropdownMenuItem
                key={org.id}
                onSelect={() => handleSelect(org.id, org.name)}
                className="justify-between"
              >
                <span className="truncate">{org.name}</span>
                {org.id === current.id ? <Check className="size-4" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
