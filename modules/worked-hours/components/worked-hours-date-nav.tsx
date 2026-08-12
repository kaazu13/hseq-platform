"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type WorkedHoursDateNavProps = {
  basePath: string;
  workDate: string;
  todayDate: string;
};

function shiftDate(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Item 5: a clear previous/next-day date selector for the management
 * Worked Hours view — mirrors DailyTeamsHeader's identical prev/next-day +
 * date-input pattern (modules/daily-workforce/components/daily-teams-header.tsx)
 * so a Project Manager can reach and correct ANY previous date directly,
 * not only via the Archive list's links. The day view itself
 * (worked-hours/page.tsx) already fully supports an arbitrary `?date=`,
 * this only adds the missing, discoverable UI for reaching it.
 */
export function WorkedHoursDateNav({ basePath, workDate, todayDate }: WorkedHoursDateNavProps) {
  const router = useRouter();
  const isToday = workDate === todayDate;

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`${basePath}?date=${shiftDate(workDate, -1)}`} />} aria-label="Previous day">
        <ChevronLeft />
      </Button>
      <Input
        type="date"
        value={workDate}
        onChange={(event) => router.push(`${basePath}?date=${event.target.value}`)}
        className="w-auto"
        aria-label="Select date"
      />
      <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`${basePath}?date=${shiftDate(workDate, 1)}`} />} aria-label="Next day">
        <ChevronRight />
      </Button>
      {!isToday && (
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={basePath} />}>
          Today
        </Button>
      )}
    </div>
  );
}
