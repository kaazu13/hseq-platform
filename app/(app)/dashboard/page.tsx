import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  FileBadge,
  FolderKanban,
  ListChecks,
  Plus,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import {
  countActiveMembers,
  getCurrentUserProfile,
  listActiveOrganizationsForUser,
} from "@/modules/organizations/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusIndicator, type StatusTone } from "@/components/shared/status-indicator";

const ORG_STATUS_TONE: Record<string, StatusTone> = {
  trial: "info",
  active: "success",
  suspended: "danger",
};

/**
 * Organization-aware dashboard — see docs/IMPLEMENTATION_PLAN.md M7.5.
 *
 * Exactly one thing on this page is a real KPI (Team Members, from
 * `countActiveMembers`); everything else is a `StatCard`/`EmptyState` in
 * its "not yet available" form, per the milestone's explicit instruction
 * not to present fabricated numbers as real data. The zero-membership
 * case is its own distinct branch, not a degraded version of the normal
 * one.
 */
export default async function DashboardPage() {
  const { user } = await requireUser();
  const [memberships, profile] = await Promise.all([
    listActiveOrganizationsForUser(user.id),
    getCurrentUserProfile(user.id),
  ]);

  const displayName = profile?.full_name?.trim() || user.email?.split("@")[0] || "there";

  if (memberships.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title={`Welcome, ${displayName}`} description="Let's get you into an organization." />
        <EmptyState
          icon={Users}
          title="You're not part of an organization yet"
          description="Organizations are set up manually for now. Once an administrator adds your account to one, it will appear here automatically — no action needed on your end."
          className="flex-1"
        />
      </div>
    );
  }

  const current = memberships[0].organization;
  const memberCount = await countActiveMembers(current.id);
  const orgTone = ORG_STATUS_TONE[current.status] ?? "neutral";

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6">
      <PageHeader
        title={`Welcome back, ${displayName}`}
        description={`Here's what's happening at ${current.name}.`}
        actions={
          <>
            <Button variant="outline" size="sm" render={<Link href="/employees" />}>
              <UserPlus />
              Add employee
            </Button>
            <Button size="sm" render={<Link href="/incidents" />}>
              <Plus />
              Report incident
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Current organization
            </span>
            <span className="text-lg font-semibold">{current.name}</span>
          </div>
          <StatusIndicator tone={orgTone} label={current.status} className="capitalize" />
        </CardContent>
      </Card>

      <div>
        <SectionHeader title="Overview" className="mb-3" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            variant="live"
            label="Team members"
            icon={Users}
            value={memberCount}
            href="/settings"
          />
          <StatCard variant="placeholder" label="Active projects" icon={FolderKanban} href="/projects" />
          <StatCard
            variant="placeholder"
            label="Certificates expiring soon"
            icon={FileBadge}
            href="/certificates"
          />
          <StatCard
            variant="placeholder"
            label="Open corrective actions"
            icon={ListChecks}
            href="/corrective-actions"
          />
        </div>
      </div>

      <div>
        <SectionHeader title="Activity & compliance" className="mb-3" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Activity className="size-4 text-muted-foreground" />
                Recent activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={Activity}
                title="No activity yet"
                description="Actions taken across your organization will show up here once business modules are in place."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="size-4 text-muted-foreground" />
                Compliance overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={ShieldCheck}
                title="Not yet available"
                description="A summary of inspections, LMRA completion, and open safety items will appear here."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <FileBadge className="size-4 text-muted-foreground" />
                Expiring certificates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={FileBadge}
                title="Not yet available"
                description="Employee certificates approaching their expiry date will be listed here."
                action={
                  <Button variant="outline" size="sm" render={<Link href="/certificates" />}>
                    View certificates
                  </Button>
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="size-4 text-muted-foreground" />
                Open corrective actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={AlertTriangle}
                title="Not yet available"
                description="Remediation tasks raised from inspections and incidents will be tracked here."
                action={
                  <Button variant="outline" size="sm" render={<Link href="/corrective-actions" />}>
                    View corrective actions
                  </Button>
                }
              />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <FolderKanban className="size-4 text-muted-foreground" />
                Project overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={FolderKanban}
                title="Not yet available"
                description="Active projects, their locations, and current status will be summarized here."
                action={
                  <Button variant="outline" size="sm" render={<Link href="/projects" />}>
                    View projects
                  </Button>
                }
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
