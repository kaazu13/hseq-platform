import {
  AlertTriangle,
  BookOpen,
  Clock,
  Eye,
  FileBadge,
  HardHat,
  ListChecks,
  MessagesSquare,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Siren,
  Users,
} from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { listProjects } from "@/modules/projects/queries";
import { getLmraOverviewCounts, listRecentLmraForOverview, type LmraListFilters } from "@/modules/lmra/queries";
import { LmraCard } from "@/modules/lmra/components/lmra-card";
import { SafetyOverviewFilters } from "@/modules/lmra/components/safety-overview-filters";
import { getObservationOverviewCounts, listRecentObservationsForOverview, type ObservationListFilters } from "@/modules/observations/queries";
import { ObservationCard } from "@/modules/observations/components/observation-card";
import { SafetyOverviewObservationFilters } from "@/modules/observations/components/safety-overview-observation-filters";
import { getCorrectiveActionOverviewCounts } from "@/modules/corrective-actions/queries";
import { getScaffoldOverviewCounts, listRecentScaffoldsForOverview, getCurrentInspectionExpiryByScaffold, type ScaffoldListFilters } from "@/modules/scaffolds/queries";
import { ScaffoldCard } from "@/modules/scaffolds/components/scaffold-card";
import { SafetyOverviewScaffoldFilters } from "@/modules/scaffolds/components/safety-overview-scaffold-filters";
import { getScaffoldDefectOverviewCounts } from "@/modules/scaffold-defects/queries";
import { getToolboxMeetingOverviewCounts, listRecentToolboxMeetingsForOverview, type ToolboxMeetingListFilters } from "@/modules/toolbox-meetings/queries";
import { ToolboxMeetingCard } from "@/modules/toolbox-meetings/components/toolbox-meeting-card";
import { getToolboxTemplateOverviewCounts } from "@/modules/toolbox-templates/queries";
import { getSafetyFlashOverviewCounts, listRecentSafetyFlashesForOverview, type SafetyFlashListFilters } from "@/modules/safety-flash/queries";
import { SafetyFlashCard } from "@/modules/safety-flash/components/safety-flash-card";
import { SafetyOverviewToolboxMeetingFilters } from "@/modules/toolbox-meetings/components/safety-overview-toolbox-meeting-filters";
import { SafetyOverviewSafetyFlashFilters } from "@/modules/safety-flash/components/safety-overview-safety-flash-filters";
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
 * "Company" filtering is implicit. "Company" isn't a concept this
 * schema models separately from company/project, so there's
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
 * Every category with no underlying module yet (incidents, certificates)
 * renders `StatCard`'s `"placeholder"` variant — never a fabricated
 * number. Toolbox Meetings/Safety Flash show no attendance percentages or
 * missing-acknowledgement counts — that module is document-based (an
 * uploaded PDF is the complete evidence record), with no digital
 * attendance tracked at all.
 */
export default async function SafetyOverviewPage({ searchParams }: SafetyOverviewPageProps) {
  const params = await searchParams;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="Safety Overview" description="Safety activity across your company at a glance." />
        <EmptyState
          icon={Users}
          title="You're not part of an company yet"
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
  const scaffoldListFilters: ScaffoldListFilters = {
    projectId: params.scfProjectId ?? params.projectId,
    workAreaSearch: params.scfWorkArea,
    scaffoldType: params.scfScaffoldType,
    status: params.scfStatus,
  };
  const toolboxMeetingListFilters: ToolboxMeetingListFilters = {
    projectId: params.tbmProjectId ?? params.projectId,
    search: params.tbmSearch,
  };
  const safetyFlashListFilters: SafetyFlashListFilters = {
    projectId: params.sfProjectId ?? params.projectId,
    search: params.sfSearch,
  };

  const [
    lmraCounts,
    recentAssessments,
    observationCounts,
    recentObservations,
    correctiveActionCounts,
    scaffoldCounts,
    recentScaffolds,
    scaffoldDefectCounts,
    toolboxMeetingCounts,
    recentToolboxMeetings,
    toolboxTemplateCounts,
    safetyFlashCounts,
    recentSafetyFlashes,
    projects,
  ] = await Promise.all([
    getLmraOverviewCounts(currentCompanyId, params.projectId),
    listRecentLmraForOverview(currentCompanyId, lmraListFilters, 12),
    getObservationOverviewCounts(currentCompanyId, params.projectId),
    listRecentObservationsForOverview(currentCompanyId, observationListFilters, 12),
    getCorrectiveActionOverviewCounts(currentCompanyId, params.projectId),
    getScaffoldOverviewCounts(currentCompanyId, params.projectId),
    listRecentScaffoldsForOverview(currentCompanyId, scaffoldListFilters, 12),
    getScaffoldDefectOverviewCounts(currentCompanyId, params.projectId),
    getToolboxMeetingOverviewCounts(currentCompanyId, params.projectId),
    listRecentToolboxMeetingsForOverview(currentCompanyId, toolboxMeetingListFilters, 12),
    getToolboxTemplateOverviewCounts(currentCompanyId),
    getSafetyFlashOverviewCounts(currentCompanyId, params.projectId),
    listRecentSafetyFlashesForOverview(currentCompanyId, safetyFlashListFilters, 12),
    listProjects(currentCompanyId),
  ]);
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
  const recentScaffoldExpiryById = await getCurrentInspectionExpiryByScaffold(currentCompanyId, recentScaffolds.map((s) => s.id));

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6">
      <PageHeader title="Safety Overview" description="Safety activity across your company at a glance." />

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
        <SectionHeader title="Scaffold Inspections" className="mb-3" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard variant="live" label="Total active scaffolds" icon={HardHat} value={scaffoldCounts.totalActive} href="/scaffolds" hint="Excludes closed/dismantled" />
          <StatCard variant="live" label="Safe scaffolds" icon={ShieldCheck} value={scaffoldCounts.safe} href="/scaffolds?status=safe" />
          <StatCard variant="live" label="Restricted scaffolds" icon={ShieldAlert} value={scaffoldCounts.restricted} href="/scaffolds?status=restricted" />
          <StatCard variant="live" label="Unsafe scaffolds" icon={ShieldX} value={scaffoldCounts.unsafe} href="/scaffolds?status=unsafe" />
          <StatCard variant="live" label="Inspections expiring soon" icon={Clock} value={scaffoldCounts.expiringSoon} href="/scaffolds" hint="Within 3 days" />
          <StatCard variant="live" label="Expired inspections" icon={AlertTriangle} value={scaffoldCounts.expired} href="/scaffolds" />
        </div>
      </div>

      <div>
        <SectionHeader title="Scaffold Defects" className="mb-3" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard variant="live" label="Open scaffold defects" icon={ListChecks} value={scaffoldDefectCounts.open} href="/scaffolds" hint="Open, in progress, or awaiting verification" />
          <StatCard variant="live" label="Overdue scaffold defects" icon={AlertTriangle} value={scaffoldDefectCounts.overdue} href="/scaffolds" />
          <StatCard variant="live" label="Defects awaiting verification" icon={Eye} value={scaffoldDefectCounts.awaitingVerification} href="/scaffolds" />
        </div>
      </div>

      <div>
        <SectionHeader title="Toolbox Meetings" description="Document-based evidence — no digital attendance/acknowledgement tracking" className="mb-3" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard variant="live" label="Uploaded today" icon={MessagesSquare} value={toolboxMeetingCounts.uploadedToday} href="/toolbox-meetings" />
          <StatCard variant="live" label="Uploaded this week" icon={MessagesSquare} value={toolboxMeetingCounts.uploadedThisWeek} href="/toolbox-meetings" />
          <StatCard
            variant="live"
            label="Latest toolbox meeting"
            icon={MessagesSquare}
            value={toolboxMeetingCounts.latest ? toolboxMeetingCounts.latest.title : "—"}
            href={toolboxMeetingCounts.latest ? `/toolbox-meetings/${toolboxMeetingCounts.latest.id}` : "/toolbox-meetings"}
          />
          <StatCard variant="live" label="Active templates" icon={BookOpen} value={toolboxTemplateCounts.activeCount} href="/toolbox-meetings?section=templates" />
        </div>
      </div>

      <div>
        <SectionHeader title="Safety Flash" className="mb-3" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard variant="live" label="Issued today" icon={Siren} value={safetyFlashCounts.issuedToday} href="/toolbox-meetings?section=safety-flash" />
          <StatCard variant="live" label="Issued this week" icon={Siren} value={safetyFlashCounts.issuedThisWeek} href="/toolbox-meetings?section=safety-flash" />
          <StatCard
            variant="live"
            label="Latest Safety Flash"
            icon={Siren}
            value={safetyFlashCounts.latest ? safetyFlashCounts.latest.title : "—"}
            href={safetyFlashCounts.latest ? `/toolbox-meetings/safety-flash/${safetyFlashCounts.latest.id}` : "/toolbox-meetings?section=safety-flash"}
          />
        </div>
      </div>

      <div>
        <SectionHeader title="Other safety areas" className="mb-3" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard variant="placeholder" label="Incidents & near misses" icon={AlertTriangle} href="/incidents" />
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

      <div className="flex flex-col gap-3">
        <SectionHeader title="Recent scaffolds" />
        <SafetyOverviewScaffoldFilters projects={projects} />

        {recentScaffolds.length === 0 ? (
          <EmptyState icon={HardHat} title="No scaffolds found" description="Try a different filter, or check back once scaffolds are registered." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recentScaffolds.map((scaffold) => (
              <ScaffoldCard key={scaffold.id} scaffold={scaffold} projectName={projectNameById.get(scaffold.project_id) ?? "Unknown project"} currentInspectionExpiresAt={recentScaffoldExpiryById.get(scaffold.id) ?? null} />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeader title="Recent toolbox meetings" />
        <SafetyOverviewToolboxMeetingFilters projects={projects} />

        {recentToolboxMeetings.length === 0 ? (
          <EmptyState icon={MessagesSquare} title="No toolbox meetings found" description="Try a different filter, or check back once meetings are uploaded." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recentToolboxMeetings.map((meeting) => (
              <ToolboxMeetingCard key={meeting.id} meeting={meeting} projectName={projectNameById.get(meeting.project_id) ?? "Unknown project"} />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeader title="Recent Safety Flashes" />
        <SafetyOverviewSafetyFlashFilters projects={projects} />

        {recentSafetyFlashes.length === 0 ? (
          <EmptyState icon={Siren} title="No Safety Flashes found" description="Try a different filter, or check back once flashes are issued." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recentSafetyFlashes.map((flash) => (
              <SafetyFlashCard key={flash.id} flash={flash} projectName={flash.project_id ? (projectNameById.get(flash.project_id) ?? "Unknown project") : "Company-wide"} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
