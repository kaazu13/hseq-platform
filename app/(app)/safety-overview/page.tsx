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
import { getObservationOverviewCounts, listRecentObservationsForOverview, type ObservationListFilters } from "@/modules/observations/queries";
import { ObservationCard } from "@/modules/observations/components/observation-card";
import { SafetyOverviewObservationFilters } from "@/modules/observations/components/safety-overview-observation-filters";
import { getCorrectiveActionOverviewCounts } from "@/modules/corrective-actions/queries";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";

type SafetyOverviewPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

/**
 * Safety Overview — see the milestone brief's Safety Overview requirements.
 * RLS scopes every query to what the caller can actually see, same as
 * every other page in this app — there is no additional client-side
 * filtering of *visibility* here, only the optional facets a viewer
 * chooses.
 *
 * "Organization" filtering is implicit. "Company" isn't a concept this
 * schema models separately from organization/project, so there's
 * deliberately no "company" filter here — see the milestone report.
 *
 * Every stat-card ROW (LMRA, Safety Observations, Corrective Actions) is a
 * set of fixed, real-time windows ("today," "open," "overdue") scoped by
 * `projectId` only — a date-range filter would make "today"/"overdue"
 * ambiguous, same reasoning already established for the LMRA row. The two
 * "Recent activity" list sections below each have their OWN full filter
 * bar (LmraFilters-shaped SafetyOverviewFilters for LMRA, the observations
 * module's own ObservationFilters for Safety Observations) — kept separate
 * rather than one shared filter bar because LMRA's and Observations'
 * `status` enums are entirely different vocabularies (draft/submitted/
 * approved/rejected/archived vs. open/closed) that cannot share one URL
 * param without one of them silently returning nothing; `projectId` is the
 * one param genuinely shared/consistent across every section on this page.
 *
 * Every category with no underlying module yet (scaffold inspections,
 * incidents, toolbox talks, certificates) renders `StatCard`'s
 * `"placeholder"` variant — never a fabricated number.
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

  const lmraListFilters: LmraListFilters = {
    projectId: params.projectId,
    status: params.status,
    workAreaSearch: params.workArea,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  };
  const observationListFilters: ObservationListFilters = {
    projectId: params.obsProjectId ?? params.projectId,
    workAreaSearch: params.obsWorkArea,
    category: params.obsCategory,
    riskLevel: params.obsRiskLevel,
    status: params.obsStatus,
    dateFrom: params.obsDateFrom,
    dateTo: params.obsDateTo,
  };

  const [lmraCounts, recentAssessments, observationCounts, recentObservations, correctiveActionCounts, projects] = await Promise.all([
    getLmraOverviewCounts(currentOrganizationId, params.projectId),
    listRecentLmraForOverview(currentOrganizationId, lmraListFilters, 12),
    getObservationOverviewCounts(currentOrganizationId, params.projectId),
    listRecentObservationsForOverview(currentOrganizationId, observationListFilters, 12),
    getCorrectiveActionOverviewCounts(currentOrganizationId, params.projectId),
    listProjects(currentOrganizationId),
  ]);
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6">
      <PageHeader title="Safety Overview" description="Safety activity across your organization at a glance." />

      <div>
        <SectionHeader title="LMRA" description="Last Minute Risk Assessments" className="mb-3" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard variant="live" label="Submitted today" icon={ShieldCheck} value={lmraCounts.submittedToday} href="/lmra" />
          <StatCard variant="live" label="Submitted this week" icon={ShieldCheck} value={lmraCounts.submittedThisWeek} href="/lmra" />
          <StatCard variant="live" label="Awaiting review" icon={Eye} value={lmraCounts.openForReview} href="/lmra?status=submitted" hint="Submitted, not yet reviewed" />
          <StatCard variant="live" label="Overdue" icon={AlertTriangle} value={lmraCounts.overdueDrafts} href="/lmra?status=draft" hint="Scheduled work never submitted" />
          <StatCard variant="live" label="Stop-work calls" icon={ShieldAlert} value={lmraCounts.stopWork} href="/lmra" hint="No-go results" />
        </div>
      </div>

      <div>
        <SectionHeader title="Safety Observations" className="mb-3" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard variant="live" label="Observations today" icon={Eye} value={observationCounts.createdToday} href="/observations" />
          <StatCard variant="live" label="Open high-risk observations" icon={AlertTriangle} value={observationCounts.openHighRisk} href="/observations?riskLevel=high" hint="High or critical risk, still open" />
          <StatCard variant="live" label="Stop-work observations" icon={ShieldAlert} value={observationCounts.stopWork} href="/observations" hint="Open, flagged as stop-work" />
        </div>
      </div>

      <div>
        <SectionHeader title="Corrective Actions" className="mb-3" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard variant="live" label="Open corrective actions" icon={ListChecks} value={correctiveActionCounts.open} href="/observations" hint="Open, in progress, or awaiting verification" />
          <StatCard variant="live" label="Overdue corrective actions" icon={AlertTriangle} value={correctiveActionCounts.overdue} href="/observations?overdueOnly=true" />
          <StatCard variant="live" label="Awaiting verification" icon={Eye} value={correctiveActionCounts.awaitingVerification} href="/observations" />
        </div>
      </div>

      <div>
        <SectionHeader title="Other safety areas" className="mb-3" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

      <div className="flex flex-col gap-3">
        <SectionHeader title="Recent observations" />
        <SafetyOverviewObservationFilters projects={projects} />

        {recentObservations.length === 0 ? (
          <EmptyState icon={Eye} title="No observations found" description="Try a different filter, or check back once observations are reported." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recentObservations.map((observation) => (
              <ObservationCard key={observation.id} observation={observation} projectName={projectNameById.get(observation.project_id) ?? "Unknown project"} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
