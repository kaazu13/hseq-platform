import { Badge } from "@/components/ui/badge";
import { SEMANTIC_TONE_BADGE_CLASSES, type SemanticTone } from "@/components/shared/status-tone";
import { cn } from "@/lib/utils";

/** A `Badge` pre-styled with one of the 5 fixed semantic tones (item 12) — never the accent-theme color. */
export function StatusBadge({ tone, className, children }: { tone: SemanticTone; className?: string; children: React.ReactNode }) {
  return <Badge className={cn(SEMANTIC_TONE_BADGE_CLASSES[tone], className)}>{children}</Badge>;
}
