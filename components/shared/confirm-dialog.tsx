"use client";

import { useTransition, type ReactElement } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type ConfirmDialogProps = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  onConfirm: () => void | Promise<void>;
  /**
   * Uncontrolled mode: the element that opens the dialog, rendered as-is
   * via Base UI's `render` composition. Use for a plain trigger (a
   * Button, a table row action) that isn't itself part of another
   * overlay.
   */
  trigger?: ReactElement;
  /**
   * Controlled mode: pass `open`/`onOpenChange` instead of `trigger` when
   * the thing that opens this dialog lives inside another overlay (e.g. a
   * DropdownMenuItem) — nesting an AlertDialogTrigger inside a menu item
   * fights with the menu's own close-on-select behavior. The caller
   * closes its own menu and flips `open` to true from an onSelect handler
   * instead. See components/app-shell/user-menu.tsx for the pattern.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * Generic confirmation prompt — see docs/UI_GUIDELINES.md §5: "Destructive/
 * hard-to-reverse actions require an explicit confirmation step (shadcn
 * AlertDialog), not a single click." One shared wrapper so every future
 * module (closing an incident, removing a member, deleting a document)
 * reuses the same interaction instead of hand-rolling AlertDialog
 * plumbing each time.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  trigger,
  open,
  onOpenChange,
}: ConfirmDialogProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <AlertDialogTrigger render={trigger} /> : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={variant === "destructive" ? "destructive" : "default"}
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                await onConfirm();
              });
            }}
          >
            {isPending ? "Please wait…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
