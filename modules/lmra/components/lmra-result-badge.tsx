import { ShieldCheck, ShieldX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LMRA_RESULT_LABELS, type LmraResult } from "@/modules/lmra/types";

/**
 * The go/no-go call — docs/UI_GUIDELINES.md §3: "LMRA result: go/no-go —
 * Go=success/green, No-go=destructive/red, never ambiguous with neutral
 * gray." Deliberately its own component, not folded into
 * lmra-status-badge.tsx's generic tone map — this is the one color pairing
 * the docs call out by name as safety-critical, so it always renders with
 * both an icon and the label, never color alone.
 */
const RESULT_STYLES: Record<LmraResult, { className: string; icon: typeof ShieldCheck }> = {
  go: { className: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400", icon: ShieldCheck },
  no_go: { className: "bg-destructive/10 text-destructive dark:bg-destructive/20", icon: ShieldX },
};

export function LmraResultBadge({ result, className }: { result: LmraResult; className?: string }) {
  const { className: toneClassName, icon: Icon } = RESULT_STYLES[result];
  return (
    <Badge className={cn(toneClassName, "gap-1", className)}>
      <Icon className="size-3.5" aria-hidden="true" />
      {LMRA_RESULT_LABELS[result]}
    </Badge>
  );
}
