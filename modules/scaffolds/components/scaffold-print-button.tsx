"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Print — same convention as modules/observations/components/observation-print-button.tsx / modules/lmra/components/lmra-detail-actions.tsx. Used for both the scaffold inspection report and the scaffold handover/status certificate, since both are just this page's own print stylesheet applied to different routes. */
export function ScaffoldPrintButton() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
      <Printer />
      Print
    </Button>
  );
}
