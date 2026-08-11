"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { markAllNotificationsRead } from "@/modules/worked-hours/actions";
import { Button } from "@/components/ui/button";

/** "[ Mark all as read ]" — Notification Center header action. */
export function MarkAllNotificationsReadButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="sm" disabled={disabled || isPending} onClick={handleClick}>
      <CheckCheck />
      Mark all as read
    </Button>
  );
}
