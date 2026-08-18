import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MessagesSquare, Plus, BookOpen, Siren } from "lucide-react";
import { requireUser, getUserRoleNames, isEmployeeOnlyAccount } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { listProjects } from "@/modules/projects/queries";
import { listToolboxMeetings, type ToolboxMeetingListFilters } from "@/modules/toolbox-meetings/queries";
import { ToolboxMeetingCard } from "@/modules/toolbox-meetings/components/toolbox-meeting-card";
import { ToolboxMeetingFilters } from "@/modules/toolbox-meetings/components/toolbox-meeting-filters";
import { ToolboxSectionNav, type ToolboxSection } from "@/modules/toolbox-meetings/components/toolbox-section-nav";
import { listToolboxTemplates, type ToolboxTemplateListFilters } from "@/modules/toolbox-templates/queries";
import { canViewToolboxTemplate } from "@/modules/toolbox-templates/permissions";
import { ToolboxTemplateCard } from "@/modules/toolbox-templates/components/toolbox-template-card";
import { ToolboxTemplateFilters } from "@/modules/toolbox-templates/components/toolbox-template-filters";
import { listSafetyFlashes, type SafetyFlashListFilters } from "@/modules/safety-flash/queries";
import { SafetyFlashCard } from "@/modules/safety-flash/components/safety-flash-card";
import { SafetyFlashFilters } from "@/modules/safety-flash/components/safety-flash-filters";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

type ToolboxMeetingsPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

/**
 * Single "Toolbox Meetings" navigation area with three sections
 * (Toolbox Meetings / Toolbox Templates / Safety Flash) switched via
 * `?section=`. RLS is the real visibility scoping for every section —
 * see the three modules' respective `_select` policies in
 * supabase/migrations/20260803160000_toolbox_meetings_and_safety_flash.sql.
 */
export default async function ToolboxMeetingsPage({ searchParams }: ToolboxMeetingsPageProps) {
  const params = await searchParams;
  const section = (params.section === "templates" || params.section === "safety-flash" ? params.section : "meetings") as ToolboxSection;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);
  const t = await getTranslations("ToolboxMeetings");

  if (!currentCompanyId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title={t("title")} description={t("noCompanyPageDescription")} />
        <EmptyState icon={MessagesSquare} title={t("noCompanyTitle")} description={t("noCompanyDescription")} className="flex-1" />
      </div>
    );
  }

  const roleNames = await getUserRoleNames(currentCompanyId);
  // Employee-role correction: read-only for Toolbox Meetings and Safety
  // Flash — every write control (create/upload) hidden. Server-side
  // enforcement is unchanged (canManageToolboxMeeting/canManageSafetyFlash
  // already excluded employee before this task); this only fixes the UI
  // still unconditionally offering these buttons to every role.
  const isPlainEmployee = isEmployeeOnlyAccount(roleNames);

  if (section === "templates") {
    const canManage = canViewToolboxTemplate(roleNames);
    if (!canManage) {
      return (
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
          <PageHeader title={t("title")} />
          <ToolboxSectionNav active={section} hideTemplates={isPlainEmployee} />
          <EmptyState icon={BookOpen} title={t("noTemplateAccessTitle")} description={t("noTemplateAccessDescription")} className="flex-1" />
        </div>
      );
    }

    const filters: ToolboxTemplateListFilters = { category: params.category, language: params.language, search: params.search, status: params.status };
    const templates = await listToolboxTemplates(currentCompanyId, filters);
    const canCreate = canViewToolboxTemplate(roleNames) && roleNames.some((role) => ["hseq_manager", "hse_officer"].includes(role));

    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader
          title={t("title")}
          actions={
            canCreate ? (
              <Button size="sm" nativeButton={false} render={<Link href="/toolbox-meetings/templates/new" />}>
                <Plus />
                {t("uploadTemplate")}
              </Button>
            ) : undefined
          }
        />
        <ToolboxSectionNav active={section} hideTemplates={isPlainEmployee} />
        <ToolboxTemplateFilters />
        {templates.length === 0 ? (
          <EmptyState icon={BookOpen} title={t("noTemplatesFoundTitle")} description={t("noTemplatesFoundDescription")} className="flex-1" />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => (
              <ToolboxTemplateCard key={template.id} template={template} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (section === "safety-flash") {
    const filters: SafetyFlashListFilters = {
      projectId: params.projectId,
      category: params.category,
      language: params.language,
      search: params.search,
      status: params.status,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    };
    const [flashes, projects] = await Promise.all([listSafetyFlashes(currentCompanyId, filters), listProjects(currentCompanyId)]);
    const projectNameById = new Map(projects.map((project) => [project.id, project.name]));

    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader
          title={t("title")}
          actions={
            isPlainEmployee ? undefined : (
              <Button size="sm" nativeButton={false} render={<Link href="/toolbox-meetings/safety-flash/new" />}>
                <Plus />
                {t("newSafetyFlash")}
              </Button>
            )
          }
        />
        <ToolboxSectionNav active={section} hideTemplates={isPlainEmployee} />
        <SafetyFlashFilters projects={projects} />
        {flashes.length === 0 ? (
          <EmptyState icon={Siren} title={t("noFlashesFoundTitle")} description={t("noFlashesFoundDescription")} className="flex-1" />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {flashes.map((flash) => (
              <SafetyFlashCard key={flash.id} flash={flash} projectName={flash.project_id ? (projectNameById.get(flash.project_id) ?? t("unknownProject")) : t("companyWide")} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const filters: ToolboxMeetingListFilters = {
    projectId: params.projectId,
    status: params.status,
    search: params.search,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  };
  const [meetings, projects] = await Promise.all([listToolboxMeetings(currentCompanyId, filters), listProjects(currentCompanyId)]);
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title={t("title")}
        description={t("mainDescription")}
        actions={
          isPlainEmployee ? undefined : (
            <Button size="sm" nativeButton={false} render={<Link href="/toolbox-meetings/new" />}>
              <Plus />
              {t("newToolboxMeeting")}
            </Button>
          )
        }
      />
      <ToolboxSectionNav active={section} hideTemplates={isPlainEmployee} />
      <ToolboxMeetingFilters projects={projects} />
      {meetings.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title={t("noMeetingsFoundTitle")}
          description={isPlainEmployee ? t("noMeetingsEmployeeDescription") : t("noMeetingsFoundDescription")}
          action={
            isPlainEmployee ? undefined : (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/toolbox-meetings/new" />}>
                <Plus />
                {t("newToolboxMeeting")}
              </Button>
            )
          }
          className="flex-1"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {meetings.map((meeting) => (
            <ToolboxMeetingCard key={meeting.id} meeting={meeting} projectName={projectNameById.get(meeting.project_id) ?? t("unknownProject")} />
          ))}
        </div>
      )}
    </div>
  );
}
