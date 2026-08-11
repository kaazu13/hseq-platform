import { renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";

/**
 * Renders a react-pdf <Document> element to a PDF buffer and wraps it as a
 * downloadable Response — the one place every Download-PDF Route Handler
 * (internal and public) converges, so headers/content-type/filename
 * sanitization are defined exactly once.
 */
export async function renderPdfResponse(document: ReactElement, filename: string): Promise<Response> {
  // @react-pdf/renderer's own types require ReactElement<DocumentProps>
  // specifically (a namespace-nested type from its `export =` module, not
  // cleanly importable on its own) — this cast is precise, not a loosened
  // `any`: it extracts the EXACT parameter type renderToBuffer itself
  // declares, so a real signature change in a future upgrade still surfaces
  // as a type error here.
  const buffer = await renderToBuffer(document as Parameters<typeof renderToBuffer>[0]);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${sanitizePdfFilename(filename)}"`,
      "Content-Length": String(buffer.length),
    },
  });
}

/** Strips characters that are unsafe in a Content-Disposition filename or across Windows/macOS/Linux filesystems — spaces and most punctuation are fine, only genuinely reserved characters are replaced. */
export function sanitizePdfFilename(name: string): string {
  const cleaned = name.replace(/[/\\:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  return cleaned.endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}
