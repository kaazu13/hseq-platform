import { Archive, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Shared active/archived badge for Toolbox Meetings, Toolbox Templates,
 * and Safety Flash — all three tables use the exact same
 * `toolbox_document_status` enum, so this lives in components/shared/
 * rather than being duplicated three times (see
 * docs/UI_GUIDELINES.md §3's icon-plus-color rule — never color alone).
 */
const TONE_CLASSES: Record<"active" | "archived", string> = {
  active: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  archived: "bg-muted text-muted-foreground",
};

export function ToolboxDocumentStatusBadge({ status, className }: { status: "active" | "archived"; className?: string }) {
  return (
    <Badge className={cn(TONE_CLASSES[status], "gap-1", className)}>
      {status === "active" ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <Archive className="size-3.5" aria-hidden="true" />}
      {status === "active" ? "Active" : "Archived"}
    </Badge>
  );
}
