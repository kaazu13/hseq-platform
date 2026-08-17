"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function shiftDate(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type DateNavProps = {
  basePath: string;
  workDate: string;
  todayDate: string;
};

/**
 * Prev day / date picker / Next day / "Today" jump — one shared control for
 * every date-scoped daily-workforce view (management Today's Teams and the
 * plain-Employee "Today's Team" personal view alike), rather than each
 * duplicating its own copy. Places no min/max on the date input: past AND
 * future dates are both valid (an employee can look ahead at a future
 * assignment, e.g. tomorrow's team, same as management already could).
 */
export function DateNav({ basePath, workDate, todayDate }: DateNavProps) {
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
