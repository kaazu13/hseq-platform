"use client";

import { useState } from "react";
import { ListChecks, Plus } from "lucide-react";
import type { CorrectiveActionDetail } from "@/modules/corrective-actions/types";
import type { EmployeeOption } from "@/components/shared/employee-combobox";
import type { RoleName } from "@/modules/companies/types";
import type { ReportShare } from "@/modules/reports/types";
import { CorrectiveActionItem } from "@/modules/corrective-actions/components/corrective-action-item";
import { CorrectiveActionFormDialog } from "@/modules/corrective-actions/components/corrective-action-form-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

type CorrectiveActionsSectionProps = {
  companyId: string;
  observationId: string;
  projectId: string;
  actions: CorrectiveActionDetail[];
  candidates: EmployeeOption[];
  canCreate: boolean;
  canManageDetails: boolean;
  roleNames: RoleName[];
  isProjectManager: boolean;
  hasProjectAccess: boolean;
  currentUserProfileId: string;
  sharesByActionId: Record<string, ReportShare[]>;
};

/** Corrective-action management, embedded on the observation detail page (this milestone's explicit placement — no standalone Corrective Actions list page). */
export function CorrectiveActionsSection({
  companyId,
  observationId,
  projectId,
  actions,
  candidates,
  canCreate,
  canManageDetails,
  roleNames,
  isProjectManager,
  hasProjectAccess,
  currentUserProfileId,
  sharesByActionId,
}: CorrectiveActionsSectionProps) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {canCreate && (
        <div className="print:hidden">
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus />
            Add corrective action
          </Button>
        </div>
      )}

      {actions.length === 0 ? (
        <EmptyState icon={ListChecks} title="No corrective actions" description="Nothing has been raised against this observation yet." />
      ) : (
        <div className="flex flex-col gap-3">
          {actions.map((action) => (
            <CorrectiveActionItem
              key={action.id}
              companyId={companyId}
              observationId={observationId}
              projectId={projectId}
              action={action}
              candidates={candidates}
              canManageDetails={canManageDetails}
              roleNames={roleNames}
              isProjectManager={isProjectManager}
              hasProjectAccess={hasProjectAccess}
              currentUserProfileId={currentUserProfileId}
              initialShares={sharesByActionId[action.id] ?? []}
            />
          ))}
        </div>
      )}

      {canCreate && (
        <CorrectiveActionFormDialog
          companyId={companyId}
          observationId={observationId}
          projectId={projectId}
          candidates={candidates}
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      )}
    </div>
  );
}
