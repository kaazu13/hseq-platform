"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronsUpDown, LogOut, Settings, User } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { logout } from "@/modules/auth/actions";

type UserMenuProps = {
  name: string;
  email: string;
};

function initialsFor(name: string, email: string) {
  const source = name.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

/**
 * Sidebar-footer user menu: avatar, name/email, Settings link, sign out.
 * The SAME component renders inside the mobile Sheet-based drawer too —
 * shadcn's `Sidebar` primitive (components/ui/sidebar.tsx) reuses this
 * exact tree for both desktop and mobile, so there is no separate
 * "mobile user menu" to keep in sync.
 *
 * Sign out uses ConfirmDialog's *controlled* mode (open/onOpenChange)
 * rather than nesting an AlertDialogTrigger inside the DropdownMenuItem —
 * nesting one overlay's trigger inside another overlay's menu item is a
 * known-fragile pattern (the menu's own close-on-click behavior, Base
 * UI's `Menu.Item` default `closeOnClick`, races the dialog trying to
 * open). Clicking the menu item just closes the menu and flips local
 * state instead — via `onClick`, the prop Base UI's `Menu.Item` actually
 * dispatches (NOT `onSelect`, which is a native, text-selection-only DOM
 * event that a click on a non-editable element never fires — see
 * node_modules/@base-ui/react/docs/react/components/menu.md, which uses
 * `onClick` in every example and documents no `onSelect` prop at all).
 */
export function UserMenu({ name, email }: UserMenuProps) {
  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);
  const initials = initialsFor(name, email);
  const displayName = name.trim() || email;

  // ConfirmDialog already wraps onConfirm in its own useTransition (shows
  // "Please wait…" and disables the action button while pending) — see
  // components/shared/confirm-dialog.tsx, same pattern as
  // archive-employee-button.tsx/restore-employee-button.tsx. On success
  // this never returns: logout() redirects server-side. It only resolves
  // here to report a failure — the underlying Supabase error is never
  // forwarded, only the generic message logout() itself returns.
  async function handleSignOut() {
    const result = await logout();
    if (!result.ok) {
      toast.error(result.error.message);
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent" />}
          >
            <Avatar className="size-7">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col text-left">
              <span className="truncate text-sm font-medium">{displayName}</span>
              <span className="truncate text-xs text-muted-foreground">{email}</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-64">
            {/* Base UI requires Menu.GroupLabel (DropdownMenuLabel) to have a
                Menu.Group (DropdownMenuGroup) ancestor — see
                node_modules/@base-ui/react/docs/react/components/menu.md's
                "Group labels" example. This label has no items of its own
                (it's a standalone header), so it gets its own one-item
                group rather than being folded into the Account/Settings
                group below it. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col">
                  <span className="truncate text-sm font-medium">{displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">{email}</span>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link href="/settings" />}>
                <User />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/settings" />}>
                <Settings />
                Settings
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmSignOutOpen(true)}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>

      <ConfirmDialog
        open={confirmSignOutOpen}
        onOpenChange={setConfirmSignOutOpen}
        title="Sign out?"
        description="You'll need to sign in again to access your organizations."
        confirmLabel="Sign out"
        variant="destructive"
        onConfirm={handleSignOut}
      />
    </SidebarMenu>
  );
}
