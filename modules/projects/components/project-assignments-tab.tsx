"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserMinus, Users } from "lucide-react";
import { toast } from "sonner";
import { assignProjectRole, endProjectAssignment } from "@/modules/projects/actions";
import { PROJECT_ASSIGNMENT_ROLES, PROJECT_ASSIGNMENT_ROLE_LABELS, type ProjectAssignmentRole, type ProjectAssignmentWithEmployee } from "@/modules/projects/types";
import { EmployeeCombobox, type EmployeeOption } from "@/components/shared/employee-combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";

type ProjectAssignmentsTabProps = {
  organizationId: string;
  projectId: string;
  assignments: ProjectAssignmentWithEmployee[];
  pickerEmployees: EmployeeOption[];
  canManage: boolean;
};

/**
 * Manages `project_assignments` — this project's roster (`member`) and its
 * Project Manager(s)/HSEQ Manager(s)/HSE Officer(s)/Inspector(s). Mirrors
 * modules/employees/components/employee-roles-tab.tsx's add/remove pattern.
 * Assigning a manager-tier role that the chosen employee doesn't already
 * hold as an organization role is rejected server-side
 * (validate_project_assignment_role_holder() in the migration) — the error
 * surfaces via the same toast path as any other validation failure.
 */
export function ProjectAssignmentsTab({ organizationId, projectId, assignments, pickerEmployees, canManage }: ProjectAssignmentsTabProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<ProjectAssignmentRole>("member");

  const assignedEmployeeIds = assignments.map((assignment) => assignment.employee_id);

  function handleAssign() {
    if (!selectedEmployeeId) return;
    startTransition(async () => {
      const result = await assignProjectRole(organizationId, projectId, {
        employeeId: selectedEmployeeId,
        assignmentRole: selectedRole,
        notes: undefined,
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setSelectedEmployeeId("");
      router.refresh();
    });
  }

  function handleRemove(assignmentId: string) {
    setRemovingId(assignmentId);
    startTransition(async () => {
      const result = await endProjectAssignment(organizationId, projectId, assignmentId);
      setRemovingId(null);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {assignments.length === 0 ? (
        <EmptyState icon={Users} title="No one is assigned to this project yet" description="Add employees below to build this project's roster." />
      ) : (
        <div className="flex flex-col gap-2">
          {assignments.map((assignment) => (
            <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">
                  {assignment.employee.first_name} {assignment.employee.last_name}
                </span>
                {assignment.employee.position_title && (
                  <span className="text-sm text-muted-foreground">{assignment.employee.position_title}</span>
                )}
                <Badge variant="secondary">{PROJECT_ASSIGNMENT_ROLE_LABELS[assignment.assignment_role]}</Badge>
              </div>
              {canManage && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${assignment.employee.first_name} ${assignment.employee.last_name}`}
                  disabled={isPending && removingId === assignment.id}
                  onClick={() => handleRemove(assignment.id)}
                >
                  {isPending && removingId === assignment.id ? <Loader2 className="animate-spin" /> : <UserMinus />}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <div className="flex flex-wrap items-end gap-2 border-t pt-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Employee</span>
            <EmployeeCombobox
              aria-label="Employee to assign"
              value={selectedEmployeeId || null}
              onValueChange={(id) => setSelectedEmployeeId(id ?? "")}
              options={pickerEmployees}
              excludeIds={assignedEmployeeIds}
              placeholder="Search by name…"
              clearable={false}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Role</span>
            <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as ProjectAssignmentRole)}>
              <SelectTrigger className="w-44" aria-label="Assignment role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_ASSIGNMENT_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {PROJECT_ASSIGNMENT_ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" disabled={!selectedEmployeeId || isPending} onClick={handleAssign}>
            {isPending && !removingId ? <Loader2 className="animate-spin" /> : null}
            Assign
          </Button>
        </div>
      )}
    </div>
  );
}
