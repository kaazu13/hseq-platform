import Link from "next/link";
import { notFound } from "next/navigation";
import { FileBadge, FileText, FolderKanban, History, Pencil } from "lucide-react";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getEmployeeByNumber, getEmployeeRoleInfo, listAllRoles, listEmploymentPeriods } from "@/modules/employees/queries";
import { canManageEmployeeRoles, canManageEmployees, canManageEmploymentLifecycle } from "@/modules/employees/permissions";
import { EmployeeOverviewTab } from "@/modules/employees/components/employee-overview-tab";
import { EmployeeRolesTab } from "@/modules/employees/components/employee-roles-tab";
import { EmploymentHistoryTab } from "@/modules/employees/components/employment-history-tab";
import { ArchiveEmployeeButton } from "@/modules/employees/components/archive-employee-button";
import { RestoreEmployeeButton } from "@/modules/employees/components/restore-employee-button";
import { AccountStatusBadge, EmploymentStatusBadge } from "@/modules/employees/components/status-badges";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type EmployeeDetailPageProps = {
  params: Promise<{ employeeNumber: string }>;
};

function initialsOf(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

/**
 * Employee profile page — docs/PRODUCT_REQUIREMENTS.md, Employee Management
 * Foundation §5. Only Overview and Roles are functional this milestone;
 * Projects/Certificates/Documents/Audit are explicit placeholders (per the
 * milestone's exclusion list — those modules don't exist yet), not hidden
 * tabs, so the information architecture is visible before it's built.
 *
 * Routed by the employee's immutable `employee_number` (e.g.
 * `/employees/VALUTRIS-00001`), not the internal UUID — see
 * modules/employees/queries.ts's `getEmployeeByNumber` and the Employee
 * Management Polish milestone's implementation report for why. The UUID
 * (`employee.id`) is still used internally for every Server Function call
 * on this page — it just never appears in a URL.
 */
export default async function EmployeeDetailPage({ params }: EmployeeDetailPageProps) {
  const { employeeNumber } = await params;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    notFound();
  }

  const employee = await getEmployeeByNumber(currentCompanyId, employeeNumber);
  if (!employee) {
    notFound();
  }

  const roleNames = await getUserRoleNames(currentCompanyId);
  const canManage = canManageEmployees(roleNames);
  const canManageRoles = canManageEmployeeRoles(roleNames);
  const canManageEmployment = canManageEmploymentLifecycle(roleNames);
  const isSelf = employee.profile_id === user.id;
  // Record-archive state — never account_status, which is a separate,
  // independent account/access lifecycle value. See the correction
  // report and modules/employees/actions.ts's archiveEmployee/
  // restoreEmployee comments.
  const isArchived = employee.archived_at !== null;
  const employeeName = `${employee.first_name} ${employee.last_name}`;

  const [roleInfo, allRoles, employmentPeriods] = await Promise.all([
    getEmployeeRoleInfo(currentCompanyId, employee.profile_id),
    listAllRoles(),
    listEmploymentPeriods(currentCompanyId, employee.id),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title={employeeName}
        description={employee.position_title ?? undefined}
        actions={
          canManage ? (
            <>
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={`/employees/${encodeURIComponent(employee.employee_number)}/edit`} />}
              >
                <Pencil />
                Edit
              </Button>
              {!isSelf &&
                (isArchived ? (
                  <RestoreEmployeeButton companyId={currentCompanyId} employeeId={employee.id} employeeName={employeeName} />
                ) : (
                  <ArchiveEmployeeButton companyId={currentCompanyId} employeeId={employee.id} employeeName={employeeName} />
                ))}
            </>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-4 rounded-lg border p-4">
        <Avatar size="lg">
          <AvatarFallback>{initialsOf(employee.first_name, employee.last_name)}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{employeeName}</span>
            <span className="font-mono text-sm text-muted-foreground">{employee.employee_number}</span>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Employment</span>
              <EmploymentStatusBadge status={employee.employment_status} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Record</span>
              <AccountStatusBadge status={employee.account_status} />
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="employment">Employment</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="certificates">Certificates</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <EmployeeOverviewTab employee={employee} />
        </TabsContent>

        <TabsContent value="roles" className="pt-4">
          <EmployeeRolesTab
            companyId={currentCompanyId}
            employeeId={employee.id}
            hasLinkedAccount={employee.profile_id !== null}
            roleInfo={roleInfo}
            allRoles={allRoles}
            canManage={canManageRoles}
            actorRoleNames={roleNames}
          />
        </TabsContent>

        <TabsContent value="employment" className="pt-4">
          <EmploymentHistoryTab
            companyId={currentCompanyId}
            employeeId={employee.id}
            employeeName={employeeName}
            periods={employmentPeriods}
            canManage={canManageEmployment && !isSelf}
          />
        </TabsContent>

        <TabsContent value="projects" className="pt-4">
          <EmptyState
            icon={FolderKanban}
            title="Not built yet"
            description="Project assignments for this employee will appear here once the Projects module ships."
          />
        </TabsContent>

        <TabsContent value="certificates" className="pt-4">
          <EmptyState
            icon={FileBadge}
            title="Not built yet"
            description="Certificates and their expiry dates for this employee will appear here once the Certificates module ships."
          />
        </TabsContent>

        <TabsContent value="documents" className="pt-4">
          <EmptyState
            icon={FileText}
            title="Not built yet"
            description="Documents attached to this employee will appear here once the Documents module ships."
          />
        </TabsContent>

        <TabsContent value="audit" className="pt-4">
          <EmptyState
            icon={History}
            title="Not built yet"
            description="A history of changes to this employee record will appear here once the Audit tab ships."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
