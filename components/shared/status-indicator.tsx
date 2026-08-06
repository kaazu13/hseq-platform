import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

const TONE_STYLES: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground/60",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-destructive",
  info: "bg-primary",
};

type StatusIndicatorProps = {
  tone: StatusTone;
  label: string;
  className?: string;
};

/**
 * Generic status dot + label — see docs/UI_GUIDELINES.md §3: "do not rely
 * on color alone for status," so this always pairs the dot with text, and
 * §3's safety-critical color table, which this intentionally does NOT
 * implement yet (scaffold tag colors, LMRA go/no-go, incident severity are
 * domain-specific and belong with those modules when they're built — see
 * that section's guidance not to invent status colors ad hoc). This is the
 * generic five-tone version for cross-cutting, non-HSEQ statuses (e.g. an
 * company's `trial`/`active`/`suspended` status, used on the
 * dashboard today).
 */
export function StatusIndicator({ tone, label, className }: StatusIndicatorProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <span className={cn("size-2 rounded-full", TONE_STYLES[tone])} aria-hidden="true" />
      {label}
    </span>
  );
}
