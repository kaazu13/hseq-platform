"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

const UPDATE_INTERVAL_MS = 30_000;

type ProjectClockProps = {
  /** The current project's IANA timezone, or null if it has none set (Task 3 Part 11's "intelligent fallback" — falls back to the viewer's own browser timezone instead of hiding the clock). */
  timezone: string | null;
};

function formatTime(timezone: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date());
}

function shortZoneLabel(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: "short", timeZone: timezone }).formatToParts(new Date());
    return parts.find((part) => part.type === "timeZoneName")?.value ?? timezone;
  } catch {
    return timezone;
  }
}

/**
 * Compact project-local clock in the header — Task 3 Part 11. Renders
 * nothing until the first client-side effect runs, so the server-rendered
 * markup and the client's FIRST render pass are identical (both empty) —
 * the actual time is only ever computed client-side, avoiding the classic
 * "server time != client time" hydration mismatch a naive
 * `new Date()`-at-render-time clock would hit. Updates once a minute, not
 * every second — a header clock only ever needs minute precision, and a
 * 1s interval would be a real, needless re-render cost (Part 39).
 */
export function ProjectClock({ timezone }: ProjectClockProps) {
  const [display, setDisplay] = useState<{ time: string; zoneLabel: string } | null>(null);

  useEffect(() => {
    // Intelligent fallback: no project timezone set -> the viewer's own
    // browser timezone, so the clock is still useful instead of just gone.
    const effectiveTimezone = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

    function update() {
      try {
        setDisplay({ time: formatTime(effectiveTimezone), zoneLabel: shortZoneLabel(effectiveTimezone) });
      } catch {
        // An invalid/unrecognized timezone string somehow made it through
        // validation (e.g. a stale value from before pg_timezone_names
        // dropped a name) — fail quietly rather than crash the header.
        setDisplay(null);
      }
    }

    update();
    const interval = setInterval(update, UPDATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [timezone]);

  if (!display) return null;

  return (
    <div className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:flex" title={display.zoneLabel}>
      <Clock className="size-4" />
      <span className="font-mono tabular-nums">{display.time}</span>
      <span className="text-xs">{display.zoneLabel}</span>
    </div>
  );
}
