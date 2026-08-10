"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type ExportDailyTeamsButtonProps = {
  companyId: string;
  projectId: string;
  workDate: string;
  className?: string;
};

/** Links directly to the export Route Handler — a real file download, not a client-side re-fetch/re-render. */
export function ExportDailyTeamsButton({ companyId, projectId, workDate, className }: ExportDailyTeamsButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      nativeButton={false}
      className={className}
      render={<a href={`/companies/${companyId}/projects/${projectId}/teams/export?date=${workDate}`} />}
    >
      <Download />
      Export
    </Button>
  );
}
