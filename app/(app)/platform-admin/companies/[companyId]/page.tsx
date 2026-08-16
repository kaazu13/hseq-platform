import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, ClipboardList, CreditCard, FolderKanban, ScrollText, ShieldAlert, Users } from "lucide-react";
import { requirePlatformSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getCompanyLogoPublicUrl } from "@/lib/storage/company-logos";
import {
  getAdminCompanyDetail,
  listAdminCompanyMembers,
  listAdminCompanyProjects,
  listAdminCompanyEmployees,
  getCompanySubscription,
  listAdminAuditEvents,
} from "@/modules/platform-admin/queries";
import { listInvitationsForCompany } from "@/modules/invitations/queries";
import {
  COMPANY_STATUS_LABELS,
  MEMBERSHIP_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  EMPLOYEE_ACCOUNT_STATUS_LABELS,
  AUDIT_ACTION_LABELS,
  COMPANY_SUBSCRIPTION_STATUS_LABELS,
} from "@/modules/platform-admin/types";
import { AssignCompanyAdmin } from "@/modules/platform-admin/components/assign-company-admin";
import { BillingEditDialog } from "@/modules/platform-admin/components/billing-edit-dialog";
import { InvitationActionsRow } from "@/modules/platform-admin/components/invitation-actions-row";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

type PageProps = { params: Promise<{ companyId: string }> };

function companyStatusVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "suspended") return "destructive";
  if (status === "trial") return "secondary";
  return "default";
}

/** Part 2B — company profile: status, employees, users/memberships with roles, projects, invitations, usage counts, scoped audit trail, and a billing section. */
export default async function PlatformAdminCompanyDetailPage({ params }: PageProps) {
  await requirePlatformSuperAdmin();
  const { companyId } = await params;

  const [detail, members, projects, employees, subscription, invitations, auditEvents] = await Promise.all([
    getAdminCompanyDetail(companyId),
    listAdminCompanyMembers(companyId),
    listAdminCompanyProjects(companyId),
    listAdminCompanyEmployees(companyId),
    getCompanySubscription(companyId),
    listInvitationsForCompany(companyId),
    listAdminAuditEvents({ companyId }, 1, 20),
  ]);

  if (!detail) notFound();

  let logoUrl: string | null = null;
  if (detail.logo_storage_path) {
    const supabase = await createClient();
    logoUrl = getCompanyLogoPublicUrl(supabase, detail.logo_storage_path);
  }

  const pendingInvitations = invitations.filter((invitation) => invitation.status === "pending");

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <Button size="sm" variant="ghost" className="w-fit" nativeButton={false} render={<Link href="/platform-admin/companies" />}>
        <ArrowLeft />
        All companies
      </Button>

      <PageHeader
        title={detail.name}
        description={`/${detail.slug} — employee prefix ${detail.employee_number_prefix} — created ${new Date(detail.created_at).toLocaleDateString()}`}
        actions={<Badge variant={companyStatusVariant(detail.status)}>{COMPANY_STATUS_LABELS[detail.status]}</Badge>}
      />

      <div className="flex items-center gap-4">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Storage-hosted logo, not a local/optimizable asset
          <img src={logoUrl} alt={`${detail.name} logo`} className="size-16 rounded-md border object-contain" />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-md border bg-muted">
            <Building2 className="size-6 text-muted-foreground" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          <span>
            <span className="text-muted-foreground">Employees: </span>
            {detail.active_employees} active / {detail.total_employees} total
          </span>
          <span>
            <span className="text-muted-foreground">Users: </span>
            {detail.active_memberships}
          </span>
          <span>
            <span className="text-muted-foreground">Projects: </span>
            {detail.active_projects}
          </span>
          <span>
            <span className="text-muted-foreground">Pending invitations: </span>
            {detail.pending_invitations}
          </span>
        </div>
      </div>

      {detail.admin_names.length === 0 ? (
        <>
          <Alert>
            <ShieldAlert className="size-4" />
            <AlertDescription>This company has no active company administrator. Assign one below so day-to-day management is not blocked.</AlertDescription>
          </Alert>
          <AssignCompanyAdmin companyId={detail.id} companyName={detail.name} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Company administrator{detail.admin_names.length > 1 ? "s" : ""}: <span className="text-foreground">{detail.admin_names.join(", ")}</span>
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Users className="size-4" />
            Users &amp; roles
          </CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <EmptyState icon={Users} title="No members yet" />
          ) : (
            <div className="flex flex-col gap-2">
              {members.map((member) => (
                <div key={member.membership_id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm last:border-b-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/platform-admin/users?q=${encodeURIComponent(member.email)}`} className="font-medium hover:underline">
                      {member.full_name}
                    </Link>
                    <span className="text-muted-foreground">{member.email}</span>
                    <Badge variant={member.status === "active" ? "secondary" : "outline"}>{MEMBERSHIP_STATUS_LABELS[member.status]}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {member.role_names.length === 0 ? <span className="text-xs text-muted-foreground">No roles</span> : member.role_names.map((name) => <Badge key={name} variant="outline">{name.replace(/_/g, " ")}</Badge>)}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="pt-3">
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/platform-admin/roles?companyId=${detail.id}`} />}>
              Manage roles &amp; permissions for this company
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <ClipboardList className="size-4" />
            Employees
          </CardTitle>
        </CardHeader>
        <CardContent>
          {employees.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No employee records yet" />
          ) : (
            <div className="flex flex-col gap-2">
              {employees.map((employee) => (
                <div key={employee.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm last:border-b-0 last:pb-0">
                  <span>
                    {employee.first_name} {employee.last_name} <span className="text-muted-foreground">({employee.employee_number})</span>
                  </span>
                  <Badge variant="outline">{EMPLOYEE_ACCOUNT_STATUS_LABELS[employee.account_status]}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <FolderKanban className="size-4" />
            Projects
          </CardTitle>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <EmptyState icon={FolderKanban} title="No projects yet" />
          ) : (
            <div className="flex flex-col gap-2">
              {projects.map((project) => (
                <div key={project.id} className="flex items-center justify-between gap-2 border-b pb-2 text-sm last:border-b-0 last:pb-0">
                  <span>{project.name}</span>
                  <Badge variant="outline">{PROJECT_STATUS_LABELS[project.status]}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Invitations</CardTitle>
        </CardHeader>
        <CardContent>
          {pendingInvitations.length === 0 ? (
            <EmptyState icon={Users} title="No pending invitations" />
          ) : (
            <div className="flex flex-col gap-2">
              {pendingInvitations.map((invitation) => (
                <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm last:border-b-0 last:pb-0">
                  <span>
                    {invitation.full_name} — {invitation.email} <span className="text-muted-foreground">({invitation.role_names.join(", ")})</span>
                  </span>
                  <InvitationActionsRow invitationId={invitation.id} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 text-sm font-medium">
            <span className="flex items-center gap-2">
              <CreditCard className="size-4" />
              Billing / subscription
            </span>
            <BillingEditDialog
              companyId={detail.id}
              companyName={detail.name}
              current={{
                planName: subscription?.plan_name ?? null,
                status: subscription?.subscription_status ?? null,
                employeeLimit: subscription?.employee_limit ?? null,
                projectLimit: subscription?.project_limit ?? null,
                billingRenewalDate: subscription?.billing_renewal_date ?? null,
                notes: subscription?.notes ?? null,
              }}
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!subscription ? (
            <p className="text-sm text-muted-foreground">No plan set. Manual billing — no automated payment processing yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <span>
                <span className="text-muted-foreground">Plan: </span>
                {subscription.plan_name ?? "—"}
              </span>
              <span>
                <span className="text-muted-foreground">Status: </span>
                {COMPANY_SUBSCRIPTION_STATUS_LABELS[subscription.subscription_status]}
              </span>
              <span>
                <span className="text-muted-foreground">Employees: </span>
                {detail.active_employees} / {subscription.employee_limit ?? "no limit"}
              </span>
              <span>
                <span className="text-muted-foreground">Projects: </span>
                {detail.active_projects} / {subscription.project_limit ?? "no limit"}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 text-sm font-medium">
            <span className="flex items-center gap-2">
              <ScrollText className="size-4" />
              Recent audit activity for this company
            </span>
            <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={`/platform-admin/audit?companyId=${detail.id}`} />}>
              View all
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {auditEvents.items.length === 0 ? (
            <EmptyState icon={ScrollText} title="No recorded activity for this company yet" />
          ) : (
            <div className="flex flex-col gap-2">
              {auditEvents.items.map((event) => (
                <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm last:border-b-0 last:pb-0">
                  <span>
                    <span className="font-medium">{event.actor_full_name ?? "System"}</span> {AUDIT_ACTION_LABELS[event.action].toLowerCase()} {event.entity_type.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
