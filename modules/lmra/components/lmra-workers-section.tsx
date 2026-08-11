"use client";

import { EmployeeMultiSelect } from "@/components/shared/employee-multi-select";
import { LmraAddDailyTeamButton } from "@/modules/lmra/components/lmra-add-daily-team-dialog";
import type { EmployeeOption } from "@/modules/employees/employee-options";
import { LMRA_MAX_PARTICIPANTS } from "@/modules/lmra/types";
import { SectionHeader } from "@/components/shared/section-header";

type LmraWorkersSectionProps = {
  companyId: string;
  projectId: string;
  workDate: string;
  options: EmployeeOption[];
  selectedIds: string[];
  /** Optional so a read-only render (e.g. the detail page, a Server Component) never needs to pass a function prop across the server/client boundary. */
  onChange?: (ids: string[]) => void;
  readOnly?: boolean;
};

/**
 * "Workers involved" (Phase 3) — replaces the old checkbox-wall picker with
 * a searchable add/remove list plus "[ Add Today's Team ]", which merges
 * that day's actual team roster in (deduplicated against whatever's already
 * selected — a plain array-union, since EmployeeMultiSelect's onChange
 * already treats the id list as a set of distinct values).
 */
export function LmraWorkersSection({ companyId, projectId, workDate, options, selectedIds, onChange, readOnly }: LmraWorkersSectionProps) {
  function handleAddTeam(employeeIds: string[]) {
    if (!onChange) return;
    const merged = new Set(selectedIds);
    for (const id of employeeIds) merged.add(id);
    onChange([...merged]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeader title={`Workers involved (${selectedIds.length})`} />
        {!readOnly && <LmraAddDailyTeamButton companyId={companyId} projectId={projectId} workDate={workDate} onAddTeam={handleAddTeam} />}
      </div>

      {readOnly ? (
        selectedIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No workers recorded.</p>
        ) : (
          <div className="flex flex-col divide-y overflow-hidden rounded-lg border">
            {selectedIds
              .map((id) => options.find((option) => option.value === id))
              .filter((option): option is EmployeeOption => Boolean(option))
              .map((option) => (
                <div key={option.value} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="truncate font-medium">{option.label}</span>
                  {option.roleLabel && <span className="shrink-0 text-xs text-muted-foreground">{option.roleLabel}</span>}
                </div>
              ))}
          </div>
        )
      ) : (
        <EmployeeMultiSelect
          options={options}
          selectedIds={selectedIds}
          onChange={onChange ?? (() => {})}
          placeholder="Search employee…"
          emptyMessage="No one is currently rostered onto this project."
          maxCount={LMRA_MAX_PARTICIPANTS}
        />
      )}
    </div>
  );
}
