import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SEMANTIC_TONE_TEXT_CLASSES, type SemanticTone } from "@/components/shared/status-tone";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  icon: LucideIcon;
  href?: string;
} & (
  | { variant: "live"; value: string | number; hint?: string; tone?: SemanticTone }
  | { variant: "placeholder"; hint?: string }
);

/**
 * KPI card for the dashboard — see docs/UI_GUIDELINES.md §4 ("summary stat
 * cards") and the milestone requirement to never present fabricated
 * numbers as real data.
 *
 * Two variants, deliberately visually distinct rather than both showing a
 * number:
 *  - `"live"`: a real value from a real query (e.g. company count).
 *  - `"placeholder"`: the underlying module doesn't exist yet. Renders an
 *    em dash and a "Not yet available" badge instead of "0" — a true zero
 *    would read as "we checked and there are none," which is a claim
 *    about your data, not about the software. This card makes the claim
 *    about the software instead.
 */
export function StatCard(props: StatCardProps) {
  const { label, icon: Icon, href } = props;
  const isLive = props.variant === "live";

  const content = (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4 transition-colors",
        isLive ? "bg-card" : "border-dashed bg-muted/30",
        href && "hover:border-primary/40",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className={cn("size-4", isLive ? "text-muted-foreground" : "text-muted-foreground/60")} aria-hidden="true" />
      </div>
      <div className="flex items-baseline gap-2">
        {isLive ? (
          <span className={cn("text-2xl font-semibold tabular-nums", props.tone && SEMANTIC_TONE_TEXT_CLASSES[props.tone])}>{props.value}</span>
        ) : (
          <span className="text-2xl font-semibold text-muted-foreground/50" aria-hidden="true">
            —
          </span>
        )}
        {!isLive && (
          <Badge variant="secondary" className="text-muted-foreground">
            Not yet available
          </Badge>
        )}
      </div>
      {props.hint ? <p className="text-xs text-muted-foreground">{props.hint}</p> : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
        {content}
      </Link>
    );
  }

  return content;
}
