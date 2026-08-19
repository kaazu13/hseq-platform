"use client";

import type { InspectionHealthBucket } from "@/modules/scaffolds/inspection-health";

type DonutSlice = { bucket: InspectionHealthBucket; count: number; label: string };

const BUCKET_COLOR: Record<InspectionHealthBucket, string> = {
  green: "#16a34a",
  orange: "#f59e0b",
  red: "#dc2626",
  gray: "#9ca3af",
};

const RADIUS = 42;
const STROKE_WIDTH = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Part J — a compact, dependency-free SVG donut (no charting library
 * added just for one chart). Counts remain visible as an accessible list
 * beside/below the chart (never chart-only information), and the SVG
 * itself carries a text alternative via `role="img"`/`aria-label` for
 * screen readers, since the individual arcs have no accessible names of
 * their own.
 */
export function InspectionHealthDonut({ slices, total, centerLabel }: { slices: DonutSlice[]; total: number; centerLabel: string }) {
  let offset = 0;
  const summary = slices.map((s) => `${s.label}: ${s.count}`).join(", ");

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <svg viewBox="0 0 100 100" className="size-40 shrink-0 -rotate-90" role="img" aria-label={`${centerLabel}. ${summary}`}>
        <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="currentColor" className="text-muted" strokeWidth={STROKE_WIDTH} />
        {total > 0 &&
          slices
            .filter((s) => s.count > 0)
            .map((slice) => {
              const fraction = slice.count / total;
              const dashArray = `${fraction * CIRCUMFERENCE} ${CIRCUMFERENCE}`;
              const dashOffset = -offset * CIRCUMFERENCE;
              offset += fraction;
              return (
                <circle
                  key={slice.bucket}
                  cx="50"
                  cy="50"
                  r={RADIUS}
                  fill="none"
                  stroke={BUCKET_COLOR[slice.bucket]}
                  strokeWidth={STROKE_WIDTH}
                  strokeDasharray={dashArray}
                  strokeDashoffset={dashOffset}
                />
              );
            })}
        <text x="50" y="50" textAnchor="middle" dominantBaseline="middle" className="rotate-90 fill-foreground text-[20px] font-semibold" style={{ transformOrigin: "50px 50px" }}>
          {total}
        </text>
      </svg>

      <ul className="flex flex-col gap-1.5">
        {slices.map((slice) => (
          <li key={slice.bucket} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: BUCKET_COLOR[slice.bucket] }} aria-hidden="true" />
            <span className="text-muted-foreground">{slice.label}</span>
            <span className="font-medium tabular-nums">{slice.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
