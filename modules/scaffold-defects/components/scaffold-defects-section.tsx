"use client";

import { useState } from "react";
import { ListChecks, Plus } from "lucide-react";
import type { ScaffoldDefectDetail } from "@/modules/scaffold-defects/types";
import type { EmployeeOption } from "@/components/shared/employee-combobox";
import type { RoleName } from "@/modules/companies/types";
import { ScaffoldDefectItem } from "@/modules/scaffold-defects/components/scaffold-defect-item";
import { ScaffoldDefectFormDialog } from "@/modules/scaffold-defects/components/scaffold-defect-form-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

type ScaffoldDefectsSectionProps = {
  companyId: string;
  inspectionId: string;
  scaffoldId: string;
  projectId: string;
  defects: ScaffoldDefectDetail[];
  candidates: EmployeeOption[];
  canCreate: boolean;
  canManageDetails: boolean;
  roleNames: RoleName[];
  hasProjectAccess: boolean;
  currentUserProfileId: string;
};

/** Defect management, embedded on the inspection edit/detail page — mirrors modules/corrective-actions/components/corrective-actions-section.tsx. */
export function ScaffoldDefectsSection({
  companyId,
  inspectionId,
  scaffoldId,
  projectId,
  defects,
  candidates,
  canCreate,
  canManageDetails,
  roleNames,
  hasProjectAccess,
  currentUserProfileId,
}: ScaffoldDefectsSectionProps) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {canCreate && (
        <div className="print:hidden">
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus />
            Add defect
          </Button>
        </div>
      )}

      {defects.length === 0 ? (
        <EmptyState icon={ListChecks} title="No defects" description="Nothing has been raised against this inspection yet." />
      ) : (
        <div className="flex flex-col gap-3">
          {defects.map((defect) => (
            <ScaffoldDefectItem
              key={defect.id}
              companyId={companyId}
              inspectionId={inspectionId}
              scaffoldId={scaffoldId}
              projectId={projectId}
              defect={defect}
              candidates={candidates}
              canManageDetails={canManageDetails}
              roleNames={roleNames}
              hasProjectAccess={hasProjectAccess}
              currentUserProfileId={currentUserProfileId}
            />
          ))}
        </div>
      )}

      {canCreate && (
        <ScaffoldDefectFormDialog companyId={companyId} inspectionId={inspectionId} scaffoldId={scaffoldId} projectId={projectId} candidates={candidates} open={createOpen} onOpenChange={setCreateOpen} />
      )}
    </div>
  );
}
