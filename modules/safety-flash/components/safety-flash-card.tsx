import Link from "next/link";
import { Siren } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ToolboxDocumentStatusBadge } from "@/components/shared/toolbox-document-status-badge";
import { HSEQ_DOCUMENT_CATEGORY_LABELS } from "@/modules/toolbox-templates/types";
import { formatSafetyFlashNumberLabel, type SafetyFlash } from "@/modules/safety-flash/types";

export function SafetyFlashCard({ flash, projectName }: { flash: SafetyFlash; projectName: string }) {
  return (
    <Link href={`/toolbox-meetings/safety-flash/${flash.id}`} className="block focus-visible:outline-2 focus-visible:outline-ring">
      <Card className="h-full transition-colors hover:bg-muted/40">
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Siren className="size-3.5" aria-hidden="true" />
              {formatSafetyFlashNumberLabel(flash.flash_number)}
            </div>
            <ToolboxDocumentStatusBadge status={flash.status} />
          </div>
          <p className="text-sm font-semibold text-balance">{flash.title}</p>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <dt>Issued</dt>
            <dd className="text-right text-foreground">{flash.date_issued}</dd>
            <dt>Category</dt>
            <dd className="truncate text-right text-foreground">{HSEQ_DOCUMENT_CATEGORY_LABELS[flash.category]}</dd>
            <dt>Scope</dt>
            <dd className="truncate text-right text-foreground">{projectName}</dd>
          </dl>
        </CardContent>
      </Card>
    </Link>
  );
}
