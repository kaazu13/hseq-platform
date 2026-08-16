import { CheckCircle2, ShieldAlert, ShieldX, TriangleAlert, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SCAFFOLD_INSPECTION_OUTCOME_LABELS, type ScaffoldInspectionOutcome } from "@/modules/scaffolds/types";

/** docs/UI_GUIDELINES.md §3's "never rely on color alone" principle — every outcome pairs a distinct icon with its tone, not just color. */
const OUTCOME_STYLES: Record<ScaffoldInspectionOutcome, { className: string; icon: typeof CheckCircle2 }> = {
  safe_for_use: { className: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400", icon: CheckCircle2 },
  safe_with_restrictions: { className: "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400", icon: TriangleAlert },
  unsafe_do_not_use: { className: "bg-destructive/10 text-destructive dark:bg-destructive/20", icon: ShieldX },
  // Standardized to the same amber-500 token as safe_with_restrictions
  // (completion pass, Part 4) — same "caution/pending" semantic family as
  // ScaffoldStatusBadge's identical fix; previously used a different
  // Tailwind hue (orange) for the same meaning.
  awaiting_corrective_action: { className: "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400", icon: ShieldAlert },
  closed_dismantled: { className: "bg-muted text-muted-foreground", icon: XCircle },
};

export function ScaffoldInspectionOutcomeBadge({ outcome, className }: { outcome: ScaffoldInspectionOutcome; className?: string }) {
  const { className: toneClassName, icon: Icon } = OUTCOME_STYLES[outcome];
  return (
    <Badge className={cn(toneClassName, "gap-1", className)}>
      <Icon className="size-3.5" aria-hidden="true" />
      {SCAFFOLD_INSPECTION_OUTCOME_LABELS[outcome]}
    </Badge>
  );
}
