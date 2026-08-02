import {
  AlertTriangle,
  ClipboardCheck,
  Eye,
  FileBadge,
  ListChecks,
  MessagesSquare,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { resolveCurrentOrganization } from "@/modules/organizations/queries";
import { listProjects } from "@/modules/projects/queries";
import { getLmraOverviewCounts, listRecentLmraForOverview, type LmraListFilters } from "@/modules/lmra/queries";
import { LmraCard } from "@/modules/lmra/components/lmra-card";
import { SafetyOverviewFilters } from "@/modules/lmra/components/safety-overview-filters";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";

type SafetyOverviewPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

/**
 * Safety Overview — see the milestone brief's Safety Overview requirements.
 * RLS scopes every query to what the caller can actually see (org-wide HSE/
 * company roles see the whole organization; everyone else only their
 * assigned projects), same as every other page in this app — there is no
 * additional client-side filtering of *visibility* here, only the optional
 * project/work-area/status/date facets a viewer chooses.
 *
 * "Organization" filtering is implicit — this page always shows the
 * caller's current organization, like every other page in the app; there's
 * no cross-organization view for any role in this schema. "Company" isn't a
 * concept this schema models separately from organization/project, so
 * there's deliberately no "company" filter here — see the milestone report.
 *
 * The five LMRA stat cards up top are fixed, real-time windows ("today,"
 * "this week," "awaiting review," "overdue," "stop-work calls") that
 * wouldn't mean anything if a date-range filter could also apply to them
 * (what would "today" mean under a date filter of last month?) — so
 * `projectId` scopes them, but `workArea`/`status`/`dateFrom`/`dateTo` only
 * apply to the "Recent LMRA activity" list below, which is exactly
 * `listLmraAssessments`' filter set (see modules/lmra/queries.ts).
 *
 * Every category with no underlying module yet (safety observations,
 * corrective actions, scaffold inspections, incidents, toolbox talks,
 * certificates) renders `StatCard`'s `"placeholder"` variant — never a
 * fabricated number — per the milestone's explicit instruction.
 */
export default async function SafetyOverviewPage({ searchParams }: SafetyOverviewPageProps) {
  const params = await searchParams;
  const { user } = await requireUser();
  const { currentOrganizationId } = await resolveCurrentOrganization(user.id);

  if (!currentOrganizationId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="Safety Overview" description="Safety activity across your organization at a glance." />
        <EmptyState
          icon={Users}
          title="You're not part of an organization yet"
          description="Once an administrator adds your account to one, safety activity will appear here."
          className="flex-1"
        />
      </div>
    );
  }

  const listFilters: LmraListFilters = {
    projectId: params.projectId,
    status: params.status,
    workAreaSearch: params.workArea,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  };

  const [counts, recentAssessments, projects] = await Promise.all([
    getLmraOverviewCounts(currentOrganizationId, params.projectId),
    listRecentLmraForOverview(currentOrganizationId, listFilters, 12),
    listProjects(currentOrganizationId),
  ]);
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6">
      <PageHeader title="Safety Overview" description="Safety activity across your organization at a glance." />

      <div>
        <SectionHeader title="LMRA" description="Last Minute Risk Assessments" className="mb-3" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard variant="live" label="Submitted today" icon={ShieldCheck} value={counts.submittedToday} href="/lmra" />
          <StatCard variant="live" label="Submitted this week" icon={ShieldCheck} value={counts.submittedThisWeek} href="/lmra" />
          <StatCard variant="live" label="Awaiting review" icon={Eye} value={counts.openForReview} href="/lmra?status=submitted" hint="Submitted, not yet reviewed" />
          <StatCard variant="live" label="Overdue" icon={AlertTriangle} value={counts.overdueDrafts} href="/lmra?status=draft" hint="Scheduled work never submitted" />
          <StatCard variant="live" label="Stop-work calls" icon={ShieldAlert} value={counts.stopWork} href="/lmra" hint="No-go results" />
        </div>
      </div>

      <div>
        <SectionHeader title="Other safety areas" className="mb-3" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard variant="placeholder" label="Open safety observations" icon={Eye} />
          <StatCard variant="placeholder" label="Open corrective actions" icon={ListChecks} href="/corrective-actions" />
          <StatCard variant="placeholder" label="Scaffold inspections" icon={ClipboardCheck} href="/inspections" />
          <StatCard variant="placeholder" label="Incidents & near misses" icon={AlertTriangle} href="/incidents" />
          <StatCard variant="placeholder" label="Toolbox meeting participation" icon={MessagesSquare} href="/toolbox-talks" />
          <StatCard variant="placeholder" label="Expiring qualifications & certificates" icon={FileBadge} href="/certificates" />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeader title="Recent LMRA activity" />
        <SafetyOverviewFilters projects={projects} />

        {recentAssessments.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No LMRAs found" description="Try a different filter, or check back once crews start submitting assessments." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recentAssessments.map((assessment) => (
              <LmraCard key={assessment.id} assessment={assessment} projectName={projectNameById.get(assessment.project_id) ?? "Unknown project"} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
