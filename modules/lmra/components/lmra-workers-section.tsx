"use client";

import { EmployeeMultiSelect } from "@/components/shared/employee-multi-select";
import { LmraAddDailyTeamButton } from "@/modules/lmra/components/lmra-add-daily-team-dialog";
import { LmraAddMyTeamButton } from "@/modules/lmra/components/lmra-add-my-team-button";
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
  /** Item 2: only HSE Manager/project Foreman (the existing elevated-access tier) may browse and pick ANY project team — an ordinary employee only ever gets "Add My Today's Team". */
  canSelectAnyTeam?: boolean;
};

/**
 * "Workers involved" (Phase 3) — a searchable add/remove list plus two
 * quick-add shortcuts (item 2): "Add My Today's Team" (everyone — resolves
 * the caller's OWN team, no picker) and, only for elevated roles, "Select
 * Today's Team" (a full list of that day's teams, for preparing an LMRA on
 * someone else's behalf). Both merge into whatever's already selected — a
 * plain array-union, since EmployeeMultiSelect's onChange already treats
 * the id list as a set of distinct values.
 */
export function LmraWorkersSection({ companyId, projectId, workDate, options, selectedIds, onChange, readOnly, canSelectAnyTeam }: LmraWorkersSectionProps) {
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
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <LmraAddMyTeamButton companyId={companyId} projectId={projectId} workDate={workDate} onAddTeam={handleAddTeam} />
            {canSelectAnyTeam && <LmraAddDailyTeamButton companyId={companyId} projectId={projectId} workDate={workDate} onAddTeam={handleAddTeam} />}
          </div>
        )}
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
