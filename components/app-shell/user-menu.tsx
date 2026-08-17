"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Globe, LogOut, Settings, User } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { logout } from "@/modules/auth/actions";
import { updateLocale } from "@/modules/locale-preference/actions";
import { LOCALES, LOCALE_NATIVE_NAMES, DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/i18n/locale";

type UserMenuProps = {
  name: string;
  email: string;
  /** Task 3 Part 22 — resolved next-intl locale, powers the quick-switch submenu below without a trip to Settings. */
  locale: string;
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
 * Task 3 Part 16 — the profile/account menu, now in the top-right header
 * (TopBar) instead of the old sidebar-footer placement (removed from
 * AppSidebar in the same change — never left duplicated in both places).
 * A compact avatar-only trigger, matching common app-header conventions
 * (GitHub/Linear-style) rather than the wide name+email sidebar row it
 * used to be — the same info is still the first thing shown once opened.
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
export function UserMenu({ name, email, locale }: UserMenuProps) {
  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const initials = initialsFor(name, email);
  const displayName = name.trim() || email;
  const currentLocale: Locale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;

  function handleLocaleChange(next: string | null) {
    if (!next || !isSupportedLocale(next) || next === currentLocale) return;
    startTransition(async () => {
      const result = await updateLocale({ locale: next });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      router.refresh();
    });
  }

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
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="rounded-full" />} aria-label={`Account menu — ${displayName}`}>
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <ChevronsUpDown className="sr-only" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom" className="w-64">
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
            <DropdownMenuItem render={<Link href="/account" />}>
              <User />
              Account
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/settings" />}>
              <Settings />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={isPending}>
                <Globe />
                Language — {LOCALE_NATIVE_NAMES[currentLocale]}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={currentLocale} onValueChange={handleLocaleChange}>
                  {LOCALES.map((value) => (
                    <DropdownMenuRadioItem key={value} value={value} disabled={isPending}>
                      {LOCALE_NATIVE_NAMES[value]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmSignOutOpen(true)}>
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmSignOutOpen}
        onOpenChange={setConfirmSignOutOpen}
        title="Sign out?"
        description="You'll need to sign in again to access your companies."
        confirmLabel="Sign out"
        variant="destructive"
        onConfirm={handleSignOut}
      />
    </>
  );
}
