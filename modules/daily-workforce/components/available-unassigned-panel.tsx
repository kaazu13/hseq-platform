"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, UserPlus, ChevronDown, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { moveDailyTeamMember } from "@/modules/daily-workforce/actions";
import { employeeIsAssignableToday, DAILY_ATTENDANCE_STATUS_LABELS, type EmployeeDailyState } from "@/modules/daily-workforce/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const MANAGEMENT_ONLY_ROLES = ["platform_super_admin", "company_admin", "project_manager", "planner"];

function unavailableReason(state: EmployeeDailyState): string | null {
  if (state.roleNames.length > 0 && state.roleNames.every((role) => MANAGEMENT_ONLY_ROLES.includes(role))) return "Management role";
  if (state.hasPendingRequest) return "Pending request";
  if (state.attendanceStatus === "leave") return "Approved leave";
  if (state.attendanceStatus === "absent" || state.attendanceStatus === "sick") return "Confirmed absent";
  if (state.attendanceStatus !== "not_set" && state.attendanceStatus !== "present") return DAILY_ATTENDANCE_STATUS_LABELS[state.attendanceStatus];
  return null;
}

type AvailableUnassignedPanelProps = {
  companyId: string;
  projectId: string;
  workDate: string;
  workforce: EmployeeDailyState[];
  teams: { id: string; name: string }[];
};

/**
 * Part 1/19/20 — "Who is available for work today?" / "Who still hasn't
 * been placed in a team?" One bounded dataset (the day's already-fetched
 * `workforce`), computed in JS — no second query, no per-worker fetch.
 * Reuses the EXACT SAME moveDailyTeamMember() action every other
 * assignment path uses (Part 1's explicit "do not create a second
 * assignment system").
 */
export function AvailableUnassignedPanel({ companyId, projectId, workDate, workforce, teams }: AvailableUnassignedPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [pendingEmployeeId, setPendingEmployeeId] = useState<string | null>(null);

  const { availableRows, unassignedRows, assignedCount, unavailableRows } = useMemo(() => {
    const available: EmployeeDailyState[] = [];
    const unassigned: EmployeeDailyState[] = [];
    const unavailable: EmployeeDailyState[] = [];
    let assigned = 0;
    for (const state of workforce) {
      if (state.isEligibleForeman) continue; // Foremen are managed via the team roster itself, not this ordinary-worker panel.
      if (employeeIsAssignableToday(state)) {
        available.push(state);
        if (state.assignedTeam) assigned++;
        else unassigned.push(state);
      } else {
        unavailable.push(state);
      }
    }
    return { availableRows: available, unassignedRows: unassigned, assignedCount: assigned, unavailableRows: unavailable };
  }, [workforce]);

  const query = search.trim().toLowerCase();
  const visibleUnassigned = unassignedRows.filter((state) => !query || `${state.employee.first_name} ${state.employee.last_name}`.toLowerCase().includes(query));

  function handleAdd(employeeId: string, dailyTeamId: string) {
    setPendingEmployeeId(employeeId);
    startTransition(async () => {
      const result = await moveDailyTeamMember(companyId, projectId, workDate, { employeeId, dailyTeamId, role: "member" });
      setPendingEmployeeId(null);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryStat label="Available today" value={availableRows.length} />
        <SummaryStat label="Assigned" value={assignedCount} />
        <SummaryStat label="Still unassigned" value={unassignedRows.length} emphasize={unassignedRows.length > 0} />
        <SummaryStat label="Unavailable" value={unavailableRows.length} />
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search unassigned workers…" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8" />
      </div>

      {visibleUnassigned.length === 0 ? (
        <p className="rounded-md border bg-muted/20 px-3 py-4 text-center text-sm text-muted-foreground">Everyone available today is already assigned to a team.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {visibleUnassigned.map((state) => (
            <Card key={state.employee.id}>
              <CardContent className="flex items-center justify-between gap-2 py-2.5">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    {state.employee.first_name} {state.employee.last_name}
                  </span>
                  {state.employee.position_title && <span className="text-xs text-muted-foreground">{state.employee.position_title}</span>}
                </div>
                {teams.length === 0 ? (
                  <Badge variant="outline">No teams yet</Badge>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button type="button" size="sm" variant="outline" disabled={isPending && pendingEmployeeId === state.employee.id}>
                          <UserPlus />
                          Add to team
                          <ChevronDown className="size-3.5" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      {teams.map((team) => (
                        <DropdownMenuItem key={team.id} onClick={() => handleAdd(state.employee.id, team.id)}>
                          {team.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {unavailableRows.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t pt-2">
          <button type="button" onClick={() => setShowUnavailable((prev) => !prev)} className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            {showUnavailable ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {showUnavailable ? "Hide" : "View"} unavailable ({unavailableRows.length})
          </button>
          {showUnavailable && (
            <div className="flex flex-col gap-1">
              {unavailableRows.map((state) => (
                <div key={state.employee.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2.5 py-1.5 text-sm text-muted-foreground">
                  <span className="truncate">
                    {state.employee.first_name} {state.employee.last_name}
                  </span>
                  <Badge variant="outline">{unavailableReason(state)}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryStat({ label, value, emphasize }: { label: string; value: number; emphasize?: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-0.5 py-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={emphasize ? "text-xl font-semibold text-amber-600 dark:text-amber-400" : "text-xl font-semibold"}>{value}</span>
      </CardContent>
    </Card>
  );
}
