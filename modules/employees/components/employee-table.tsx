import Link from "next/link";
import { Pencil, Eye } from "lucide-react";
import type { EmployeeListItem, EmployeeRoleInfo } from "@/modules/employees/types";
import { ArchiveEmployeeButton } from "@/modules/employees/components/archive-employee-button";
import { RestoreEmployeeButton } from "@/modules/employees/components/restore-employee-button";
import { AccountStatusBadge, EmploymentStatusBadge } from "@/modules/employees/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type EmployeeTableProps = {
  companyId: string;
  employees: EmployeeListItem[];
  roleInfoById: Map<string, EmployeeRoleInfo>;
  canManage: boolean;
  currentUserId: string;
};

function RolesCell({ employee, roleInfo }: { employee: EmployeeListItem; roleInfo: EmployeeRoleInfo | undefined }) {
  if (!employee.profile_id) {
    return <span className="text-sm text-muted-foreground">No account</span>;
  }
  if (!roleInfo || roleInfo.roles.length === 0) {
    return <span className="text-sm text-muted-foreground">No roles assigned</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {roleInfo.roles.map((role) => (
        <Badge key={role.membershipRoleId} variant="secondary">
          {role.label}
        </Badge>
      ))}
    </div>
  );
}

function RowActions({
  companyId,
  employee,
  canManage,
  currentUserId,
}: {
  companyId: string;
  employee: EmployeeListItem;
  canManage: boolean;
  currentUserId: string;
}) {
  const isSelf = employee.profile_id === currentUserId;
  const employeeName = `${employee.first_name} ${employee.last_name}`;
  // Record-archive state — never account_status, which is a separate,
  // independent account/access lifecycle value. See the correction
  // report and modules/employees/actions.ts's archiveEmployee/
  // restoreEmployee comments.
  const isArchived = employee.archived_at !== null;
  const href = `/employees/${encodeURIComponent(employee.employee_number)}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" nativeButton={false} render={<Link href={href} />}>
        <Eye />
        View
      </Button>
      {canManage && (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`${href}/edit`} />}>
          <Pencil />
          Edit
        </Button>
      )}
      {canManage && !isSelf && (
        isArchived ? (
          <RestoreEmployeeButton companyId={companyId} employeeId={employee.id} employeeName={employeeName} />
        ) : (
          <ArchiveEmployeeButton companyId={companyId} employeeId={employee.id} employeeName={employeeName} />
        )
      )}
    </div>
  );
}

/**
 * Responsive employee list: a real `<table>` from `sm` up, stacked cards
 * below it — see docs/UI_GUIDELINES.md's mobile-first requirement. Both
 * render from the same `employees`/`roleInfoById` data, so there is exactly
 * one source of truth for a row's contents.
 */
export function EmployeeTable({ companyId, employees, roleInfoById, canManage, currentUserId }: EmployeeTableProps) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Employee number</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Employment status</TableHead>
              <TableHead>Account status</TableHead>
              <TableHead>Work email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((employee) => (
              <TableRow key={employee.id}>
                <TableCell className="font-medium whitespace-nowrap">
                  {employee.first_name} {employee.last_name}
                </TableCell>
                <TableCell className="font-mono text-xs whitespace-nowrap">{employee.employee_number}</TableCell>
                <TableCell>{employee.position_title ?? "—"}</TableCell>
                <TableCell>
                  <EmploymentStatusBadge status={employee.employment_status} />
                </TableCell>
                <TableCell>
                  <AccountStatusBadge status={employee.account_status} />
                </TableCell>
                <TableCell>{employee.work_email ?? "—"}</TableCell>
                <TableCell className="whitespace-normal">
                  <RolesCell employee={employee} roleInfo={roleInfoById.get(employee.id)} />
                </TableCell>
                <TableCell>
                  <RowActions
                    companyId={companyId}
                    employee={employee}
                    canManage={canManage}
                    currentUserId={currentUserId}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 sm:hidden">
        {employees.map((employee) => (
          <div key={employee.id} className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {employee.first_name} {employee.last_name}
                </p>
                <p className="text-sm text-muted-foreground">{employee.position_title ?? "No position set"}</p>
              </div>
              <EmploymentStatusBadge status={employee.employment_status} />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-muted-foreground">Employee number</span>
              <span className="font-mono text-xs">{employee.employee_number}</span>
              <span className="text-muted-foreground">Work email</span>
              <span className="truncate">{employee.work_email ?? "—"}</span>
              <span className="text-muted-foreground">Account status</span>
              <AccountStatusBadge status={employee.account_status} />
            </div>
            <RolesCell employee={employee} roleInfo={roleInfoById.get(employee.id)} />
            <RowActions
              companyId={companyId}
              employee={employee}
              canManage={canManage}
              currentUserId={currentUserId}
            />
          </div>
        ))}
      </div>
    </>
  );
}
