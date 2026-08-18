"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Clock } from "lucide-react";

const UPDATE_INTERVAL_MS = 30_000;

type ProjectClockProps = {
  /** The current project's IANA timezone, or null if it has none set (Task 3 Part 11's "intelligent fallback" — falls back to the viewer's own browser timezone instead of hiding the clock). */
  timezone: string | null;
};

/**
 * FINAL RULE (Task 3 closure) — when a project timezone is set, the header
 * clock MUST show that timezone, never the viewer's own browser timezone.
 * Extracted as a pure, exported function (previously inline in the
 * `useEffect` below) so it's deterministically unit-testable — see
 * project-clock.test.ts — independent of React/DOM rendering.
 */
export function resolveEffectiveTimezone(projectTimezone: string | null, browserTimezone: string): string {
  return projectTimezone ?? browserTimezone;
}

function formatTime(timezone: string, locale: string | undefined, now: Date): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(now);
}

function shortZoneLabel(timezone: string, locale: string | undefined, now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, { timeZoneName: "short", timeZone: timezone }).formatToParts(now);
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
  // Language controls the date/time FORMATTING (12h vs 24h conventions,
  // etc.); the project's own timezone controls the actual TIME shown —
  // these are deliberately two independent inputs, per the closure's own
  // stated rule, not the same setting.
  const locale = useLocale();
  const [display, setDisplay] = useState<{ time: string; zoneLabel: string } | null>(null);

  useEffect(() => {
    // Intelligent fallback: no project timezone set -> the viewer's own
    // browser timezone, so the clock is still useful instead of just gone.
    const effectiveTimezone = resolveEffectiveTimezone(timezone, Intl.DateTimeFormat().resolvedOptions().timeZone);

    function update() {
      try {
        const now = new Date();
        setDisplay({ time: formatTime(effectiveTimezone, locale, now), zoneLabel: shortZoneLabel(effectiveTimezone, locale, now) });
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
  }, [timezone, locale]);

  if (!display) return null;

  return (
    <div className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:flex" title={display.zoneLabel}>
      <Clock className="size-4" />
      <span className="font-mono tabular-nums">{display.time}</span>
      <span className="text-xs">{display.zoneLabel}</span>
    </div>
  );
}
