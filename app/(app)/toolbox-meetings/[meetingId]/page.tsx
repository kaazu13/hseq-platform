import { forbidden, notFound } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getProject } from "@/modules/projects/queries";
import { getToolboxMeeting, getToolboxMeetingPreviewUrl, listToolboxMeetingFileReplacements, listToolboxAuthorizedEmployees, isCallerProjectAccessible } from "@/modules/toolbox-meetings/queries";
import { canManageToolboxMeeting } from "@/modules/toolbox-meetings/permissions";
import { formatToolboxMeetingNumberLabel } from "@/modules/toolbox-meetings/types";
import { ToolboxMeetingEditForm } from "@/modules/toolbox-meetings/components/toolbox-meeting-edit-form";
import { ToolboxMeetingStatusToggle } from "@/modules/toolbox-meetings/components/toolbox-meeting-status-toggle";
import { ToolboxMeetingReplaceFileForm } from "@/modules/toolbox-meetings/components/toolbox-meeting-replace-file-form";
import { toEmployeeOptions } from "@/modules/employees/employee-options";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { ToolboxDocumentStatusBadge } from "@/components/shared/toolbox-document-status-badge";
import { PdfPreview } from "@/components/shared/pdf-preview";
import { EmployeeProfileLink } from "@/components/shared/employee-profile-link";
import { Card, CardContent } from "@/components/ui/card";

type ToolboxMeetingDetailPageProps = {
  params: Promise<{ meetingId: string }>;
};

export default async function ToolboxMeetingDetailPage({ params }: ToolboxMeetingDetailPageProps) {
  const { meetingId } = await params;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    forbidden();
  }

  const meeting = await getToolboxMeeting(currentCompanyId, meetingId);
  if (!meeting) {
    notFound();
  }

  const [roleNames, hasProjectAccess, project, previewUrl, replacements, candidateRows] = await Promise.all([
    getUserRoleNames(currentCompanyId),
    isCallerProjectAccessible(meeting.project_id),
    getProject(currentCompanyId, meeting.project_id),
    getToolboxMeetingPreviewUrl(meeting.storage_object_path),
    listToolboxMeetingFileReplacements(meeting.id),
    listToolboxAuthorizedEmployees(currentCompanyId, meeting.project_id),
  ]);

  const candidates = toEmployeeOptions(candidateRows);
  const canManage = canManageToolboxMeeting(roleNames, hasProjectAccess);

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6">
      <PageHeader title={formatToolboxMeetingNumberLabel(meeting.meeting_number)} description={meeting.title} actions={<ToolboxDocumentStatusBadge status={meeting.status} />} />

      <Card>
        <CardContent className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Project</p>
            <p className="text-sm font-medium">{project?.name ?? "Unknown project"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Date</p>
            <p className="text-sm font-medium">{meeting.meeting_date}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Work area</p>
            <p className="text-sm font-medium">{meeting.work_area ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">HSE person who held the meeting</p>
            <p className="text-sm font-medium">
              <EmployeeProfileLink employee={meeting.heldBy} />
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Uploaded by / at</p>
            <p className="text-sm font-medium">{new Date(meeting.uploaded_at).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Notes</p>
            <p className="text-sm font-medium">{meeting.notes ?? "—"}</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <SectionHeader title="Meeting PDF" />
        <PdfPreview signedUrl={previewUrl} filename={meeting.original_filename} />
      </div>

      {canManage && (
        <>
          <div className="flex flex-col gap-3">
            <SectionHeader title="Edit details" />
            <ToolboxMeetingEditForm companyId={currentCompanyId} meeting={meeting} candidates={candidates} />
          </div>

          <div className="flex flex-col gap-3">
            <SectionHeader title="Status" />
            <ToolboxMeetingStatusToggle companyId={currentCompanyId} meetingId={meeting.id} projectId={meeting.project_id} status={meeting.status} />
          </div>

          <div className="flex flex-col gap-3">
            <SectionHeader title="Replace PDF" description="If an incorrect PDF was uploaded, replace it here. The previous file is retained, never overwritten." />
            <ToolboxMeetingReplaceFileForm companyId={currentCompanyId} meetingId={meeting.id} projectId={meeting.project_id} />
          </div>
        </>
      )}

      {replacements.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionHeader title="Replacement history" />
          <div className="flex flex-col gap-2">
            {replacements.map((replacement) => (
              <Card key={replacement.id}>
                <CardContent className="flex flex-col gap-1 text-sm">
                  <p className="font-medium">{replacement.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    Replaced {new Date(replacement.replaced_at).toLocaleString()} — previous file: {replacement.previous_original_filename}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
