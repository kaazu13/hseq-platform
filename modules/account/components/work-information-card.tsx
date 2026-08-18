import { UserCog } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type WorkInformationCardProps = {
  title: string;
  employee: {
    employeeNumberLabel: string;
    employeeNumber: string;
    positionLabel: string;
    position: string;
    employmentStatusLabel: string;
    employmentStatus: string;
    startDateLabel: string;
    startDate: string | null;
  } | null;
  noEmployeeRecordTitle: string;
  noEmployeeRecordDescription: string;
  rolesLabel: string;
  roles: string[];
  noRolesAssigned: string;
  assignedProjectsLabel: string;
  projects: { id: string; name: string; roleLabel: string }[];
  noProjectAssignments: string;
};

/**
 * Account redesign (Section 6) — read-only work summary, no edit button
 * for an ordinary Employee. Replaces the old separate "Employment record"
 * card + "Assigned projects" list + a redundant roles Badge row in the
 * header — each piece of information now appears exactly once.
 */
export function WorkInformationCard({
  title,
  employee,
  noEmployeeRecordTitle,
  noEmployeeRecordDescription,
  rolesLabel,
  roles,
  noRolesAssigned,
  assignedProjectsLabel,
  projects,
  noProjectAssignments,
}: WorkInformationCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {employee ? (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">{employee.employeeNumberLabel}</dt>
              <dd className="text-sm font-medium">{employee.employeeNumber}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{employee.positionLabel}</dt>
              <dd className="text-sm font-medium">{employee.position}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{employee.employmentStatusLabel}</dt>
              <dd className="text-sm font-medium">{employee.employmentStatus}</dd>
            </div>
            {employee.startDate && (
              <div>
                <dt className="text-xs text-muted-foreground">{employee.startDateLabel}</dt>
                <dd className="text-sm font-medium">{employee.startDate}</dd>
              </div>
            )}
          </dl>
        ) : (
          <EmptyState icon={UserCog} title={noEmployeeRecordTitle} description={noEmployeeRecordDescription} />
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{rolesLabel}</span>
          {roles.length === 0 ? (
            <p className="text-sm text-muted-foreground">{noRolesAssigned}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {roles.map((role) => (
                <Badge key={role} variant="secondary">
                  {role}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{assignedProjectsLabel}</span>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">{noProjectAssignments}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {projects.map((project) => (
                <li key={project.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2">
                  <span className="truncate text-sm font-medium">{project.name}</span>
                  <Badge variant="outline">{project.roleLabel}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
