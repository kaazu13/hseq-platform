"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type ExportWorkedHoursButtonProps = {
  companyId: string;
  projectId: string;
  /** Either a single day (`date`) or a range (`from`/`to`) — the Route Handler decides which export shape to build. */
  query: string;
  label?: string;
};

export function ExportWorkedHoursButton({ companyId, projectId, query, label = "Export" }: ExportWorkedHoursButtonProps) {
  return (
    <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/companies/${companyId}/projects/${projectId}/worked-hours/export?${query}`} />}>
      <Download />
      {label}
    </Button>
  );
}
