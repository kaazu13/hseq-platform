"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Print — the printable observation report is this same route, styled for print via app/globals.css's `@media print` rules and `print:hidden` on anything interactive (same convention as modules/lmra/components/lmra-detail-actions.tsx). */
export function ObservationPrintButton() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
      <Printer />
      Print
    </Button>
  );
}
