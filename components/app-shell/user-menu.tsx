"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronsUpDown, LogOut, Settings, User } from "lucide-react";
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
 *
 * Sign out uses ConfirmDialog's *controlled* mode (open/onOpenChange)
 * rather than nesting an AlertDialogTrigger inside the DropdownMenuItem —
 * nesting one overlay's trigger inside another overlay's menu item is a
 * known-fragile pattern (the menu's own close-on-select behavior races
 * the dialog trying to open). Selecting the menu item just closes the
 * menu and flips local state instead.
 */
export function UserMenu({ name, email }: UserMenuProps) {
  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);
  const initials = initialsFor(name, email);
  const displayName = name.trim() || email;

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
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col">
                <span className="truncate text-sm font-medium">{displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{email}</span>
              </div>
            </DropdownMenuLabel>
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
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmSignOutOpen(true)}>
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
        onConfirm={async () => {
          await logout();
        }}
      />
    </SidebarMenu>
  );
}
