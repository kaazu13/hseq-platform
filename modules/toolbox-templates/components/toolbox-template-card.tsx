import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ToolboxDocumentStatusBadge } from "@/components/shared/toolbox-document-status-badge";
import { HSEQ_DOCUMENT_CATEGORY_LABELS, type ToolboxTemplate } from "@/modules/toolbox-templates/types";

export function ToolboxTemplateCard({ template }: { template: ToolboxTemplate }) {
  return (
    <Link href={`/toolbox-meetings/templates/${template.id}`} className="block focus-visible:outline-2 focus-visible:outline-ring">
      <Card className="h-full transition-colors hover:bg-muted/40">
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <BookOpen className="size-3.5" aria-hidden="true" />
              {HSEQ_DOCUMENT_CATEGORY_LABELS[template.category]}
            </div>
            <ToolboxDocumentStatusBadge status={template.status} />
          </div>
          <p className="text-sm font-semibold text-balance">{template.title}</p>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <dt>Language</dt>
            <dd className="text-right text-foreground">{template.language}</dd>
            <dt>Uploaded</dt>
            <dd className="text-right text-foreground">{new Date(template.uploaded_at).toLocaleDateString()}</dd>
          </dl>
        </CardContent>
      </Card>
    </Link>
  );
}
