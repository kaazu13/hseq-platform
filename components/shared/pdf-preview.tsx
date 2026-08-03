import { FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * Embedded PDF preview + open/download/print affordances, shared by
 * Toolbox Meetings/Templates and Safety Flash detail pages. `<object>`
 * (not `<iframe>`) is used because it natively supports fallback content
 * when the browser can't render a PDF inline — the module's explicit
 * "if browser PDF embedding is unavailable, provide a clear open-file
 * fallback" requirement. Printing isn't a separate feature here — opening
 * the signed URL uses the browser's own PDF viewer, which has its own
 * print control (also explicitly permitted: "print the PDF using the
 * browser or PDF viewer").
 */
export function PdfPreview({ signedUrl, filename }: { signedUrl: string | null; filename: string }) {
  if (!signedUrl) {
    return <EmptyState icon={FileWarning} title="Preview unavailable" description="The preview link couldn't be generated. Try reloading the page." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="h-[70vh] overflow-hidden rounded-lg border bg-muted/30">
        <object data={signedUrl} type="application/pdf" className="h-full w-full">
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-muted-foreground">Your browser can&apos;t display this PDF inline.</p>
            <Button nativeButton={false} render={<a href={signedUrl} target="_blank" rel="noopener noreferrer" />}>
              Open the PDF
            </Button>
          </div>
        </object>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" nativeButton={false} render={<a href={signedUrl} target="_blank" rel="noopener noreferrer" />}>
          Open in new tab
        </Button>
        <Button size="sm" variant="outline" nativeButton={false} render={<a href={signedUrl} download={filename} />}>
          Download
        </Button>
      </div>
    </div>
  );
}
