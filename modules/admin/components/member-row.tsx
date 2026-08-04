"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, X } from "lucide-react";
import { setMembershipStatus } from "@/modules/organizations/actions";
import { assignEmployeeRole, removeEmployeeRole, createEmployeeForMember } from "@/modules/employees/actions";
import { assignProjectRole } from "@/modules/projects/actions";
import { MEMBERSHIP_STATUS_LABELS, MEMBERSHIP_STATUSES } from "@/modules/account/types";
import type { MembershipStatus } from "@/modules/account/types";
import type { OrganizationMemberOverview } from "@/modules/account/queries";
import { PROJECT_ASSIGNMENT_ROLES, PROJECT_ASSIGNMENT_ROLE_LABELS } from "@/modules/projects/types";
import type { Project } from "@/modules/projects/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

type RoleOption = { id: string; name: string; display_label: string };

export function MemberRow({
  organizationId,
  member,
  isSelf,
  assignableRoles,
  projects,
}: {
  organizationId: string;
  member: OrganizationMemberOverview;
  isSelf: boolean;
  assignableRoles: RoleOption[];
  projects: Project[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedAssignmentRole, setSelectedAssignmentRole] = useState<(typeof PROJECT_ASSIGNMENT_ROLES)[number]>("member");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const displayName = member.employee ? `${member.employee.firstName} ${member.employee.lastName}` : null;

  function handleStatusChange(status: MembershipStatus) {
    setError(null);
    startTransition(async () => {
      const result = await setMembershipStatus(organizationId, member.membershipId, status);
      if (!result.ok) setError(result.error.message);
    });
  }

  function handleAssignRole() {
    if (!member.employee || !selectedRoleId) return;
    setError(null);
    startTransition(async () => {
      const result = await assignEmployeeRole(organizationId, member.employee!.id, member.membershipId, selectedRoleId);
      if (!result.ok) setError(result.error.message);
      else setSelectedRoleId("");
    });
  }

  function handleRemoveRole(membershipRoleId: string) {
    if (!member.employee) return;
    setError(null);
    startTransition(async () => {
      const result = await removeEmployeeRole(organizationId, member.employee!.id, membershipRoleId);
      if (!result.ok) setError(result.error.message);
    });
  }

  function handleAssignProject() {
    if (!member.employee || !selectedProjectId) return;
    setError(null);
    startTransition(async () => {
      const result = await assignProjectRole(organizationId, selectedProjectId, { employeeId: member.employee!.id, assignmentRole: selectedAssignmentRole, notes: undefined });
      if (!result.ok) setError(result.error.message);
      else setSelectedProjectId("");
    });
  }

  function handleCreateEmployee() {
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createEmployeeForMember(organizationId, member.userId, { firstName, lastName, workEmail: undefined, phone: undefined, positionTitle: undefined, birthDate: undefined, startDate: undefined });
      if (!result.ok) setError(result.error.message);
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">
              {displayName ?? <span className="text-muted-foreground italic">No linked employee record</span>}
              {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
            </p>
            {member.employee && <p className="text-xs text-muted-foreground">{member.employee.workEmail ?? "No work email on file"}</p>}
          </div>
          <Badge variant={member.status === "active" ? "secondary" : "outline"}>{MEMBERSHIP_STATUS_LABELS[member.status]}</Badge>
        </div>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-1.5">
          {member.roles.length === 0 ? (
            <span className="text-xs text-muted-foreground">No roles assigned</span>
          ) : (
            member.roles.map((role) => (
              <Badge key={role.membershipRoleId} variant="outline" className="gap-1">
                {role.label}
                <button type="button" onClick={() => handleRemoveRole(role.membershipRoleId)} disabled={isPending} aria-label={`Remove ${role.label}`}>
                  <X className="size-3" />
                </button>
              </Badge>
            ))
          )}
        </div>

        {member.projectAssignments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {member.projectAssignments.map((assignment) => (
              <Badge key={`${assignment.projectId}-${assignment.assignmentRole}`} variant="secondary">
                {assignment.projectName}: {PROJECT_ASSIGNMENT_ROLE_LABELS[assignment.assignmentRole]}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Select value={member.status} onValueChange={(value) => handleStatusChange(value as MembershipStatus)}>
            <SelectTrigger className="w-36" disabled={isSelf || isPending} aria-label="Change status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEMBERSHIP_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {MEMBERSHIP_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isSelf && <span className="text-xs text-muted-foreground">You can&apos;t change your own status</span>}
        </div>

        {member.employee ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={selectedRoleId} onValueChange={(value) => setSelectedRoleId(value ?? "")}>
                <SelectTrigger className="w-48" disabled={isPending} aria-label="Choose a role to assign">
                  <SelectValue placeholder="Assign a role…" />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.display_label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" size="sm" variant="outline" disabled={!selectedRoleId || isPending} onClick={handleAssignRole}>
                {isPending ? <Loader2 className="animate-spin" /> : null}
                Assign role
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={selectedProjectId} onValueChange={(value) => setSelectedProjectId(value ?? "")}>
                <SelectTrigger className="w-48" disabled={isPending} aria-label="Choose a project">
                  <SelectValue placeholder="Assign to project…" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedAssignmentRole} onValueChange={(value) => setSelectedAssignmentRole(value as (typeof PROJECT_ASSIGNMENT_ROLES)[number])}>
                <SelectTrigger className="w-40" disabled={isPending} aria-label="Project assignment role">
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
              <Button type="button" size="sm" variant="outline" disabled={!selectedProjectId || isPending} onClick={handleAssignProject}>
                {isPending ? <Loader2 className="animate-spin" /> : null}
                Assign
              </Button>
            </div>

            <Link href={`/employees/${encodeURIComponent(member.employee.employeeNumber)}`} className="text-xs text-primary underline-offset-2 hover:underline">
              View employee record →
            </Link>
          </>
        ) : (
          <div className="flex flex-wrap items-end gap-2 border-t pt-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor={`first-${member.membershipId}`}>
                First name
              </label>
              <Input id={`first-${member.membershipId}`} className="w-32" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={isPending} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor={`last-${member.membershipId}`}>
                Last name
              </label>
              <Input id={`last-${member.membershipId}`} className="w-32" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={isPending} />
            </div>
            <Button type="button" size="sm" disabled={isPending} onClick={handleCreateEmployee}>
              {isPending ? <Loader2 className="animate-spin" /> : null}
              Create & link employee record
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
