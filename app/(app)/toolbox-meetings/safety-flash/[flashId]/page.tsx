import { forbidden, notFound } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getProject } from "@/modules/projects/queries";
import { getSafetyFlash, getSafetyFlashPreviewUrl, listSafetyFlashFileReplacements, listSafetyFlashAuthorizedEmployees, isCallerProjectAccessible } from "@/modules/safety-flash/queries";
import { canManageSafetyFlash } from "@/modules/safety-flash/permissions";
import { formatSafetyFlashNumberLabel } from "@/modules/safety-flash/types";
import { HSEQ_DOCUMENT_CATEGORY_LABELS } from "@/modules/toolbox-templates/types";
import { SafetyFlashEditForm } from "@/modules/safety-flash/components/safety-flash-edit-form";
import { SafetyFlashStatusToggle } from "@/modules/safety-flash/components/safety-flash-status-toggle";
import { SafetyFlashReplaceFileForm } from "@/modules/safety-flash/components/safety-flash-replace-file-form";
import { toEmployeeOptions } from "@/modules/employees/employee-options";
import { listReportSharesForRecord } from "@/modules/reports/queries";
import { ShareReportDialog } from "@/modules/reports/components/share-report-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { ToolboxDocumentStatusBadge } from "@/components/shared/toolbox-document-status-badge";
import { PdfPreview } from "@/components/shared/pdf-preview";
import { EmployeeProfileLink } from "@/components/shared/employee-profile-link";
import { Card, CardContent } from "@/components/ui/card";

type SafetyFlashDetailPageProps = {
  params: Promise<{ flashId: string }>;
};

export default async function SafetyFlashDetailPage({ params }: SafetyFlashDetailPageProps) {
  const { flashId } = await params;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    forbidden();
  }

  const flash = await getSafetyFlash(currentCompanyId, flashId);
  if (!flash) {
    notFound();
  }

  const [roleNames, hasProjectAccess, project, previewUrl, replacements, candidateRows] = await Promise.all([
    getUserRoleNames(currentCompanyId),
    flash.project_id ? isCallerProjectAccessible(flash.project_id) : Promise.resolve(false),
    flash.project_id ? getProject(currentCompanyId, flash.project_id) : Promise.resolve(null),
    getSafetyFlashPreviewUrl(flash.storage_object_path),
    listSafetyFlashFileReplacements(flash.id),
    listSafetyFlashAuthorizedEmployees(currentCompanyId, flash.project_id),
  ]);

  const candidates = toEmployeeOptions(candidateRows);
  const canManage = canManageSafetyFlash(roleNames, flash.project_id, hasProjectAccess);
  const shares = canManage ? await listReportSharesForRecord(currentCompanyId, "safety_flash", flash.id) : [];

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6">
      <PageHeader
        title={formatSafetyFlashNumberLabel(flash.flash_number)}
        description={flash.title}
        actions={
          <>
            <ToolboxDocumentStatusBadge status={flash.status} />
            {canManage && <ShareReportDialog companyId={currentCompanyId} projectId={flash.project_id} recordType="safety_flash" recordId={flash.id} initialShares={shares} />}
          </>
        }
      />

      <Card>
        <CardContent className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Scope</p>
            <p className="text-sm font-medium">{project?.name ?? "Company-wide"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Date issued</p>
            <p className="text-sm font-medium">{flash.date_issued}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Category</p>
            <p className="text-sm font-medium">{HSEQ_DOCUMENT_CATEGORY_LABELS[flash.category]}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Language</p>
            <p className="text-sm font-medium">{flash.language}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Issued by</p>
            <p className="text-sm font-medium">
              <EmployeeProfileLink employee={flash.issuedBy} />
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Uploaded</p>
            <p className="text-sm font-medium">{new Date(flash.uploaded_at).toLocaleString()}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">Summary</p>
            <p className="text-sm font-medium">{flash.summary ?? "—"}</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <SectionHeader title="Safety Flash PDF" />
        <PdfPreview signedUrl={previewUrl} filename={flash.original_filename} />
      </div>

      {canManage && (
        <>
          <div className="flex flex-col gap-3">
            <SectionHeader title="Edit details" />
            <SafetyFlashEditForm companyId={currentCompanyId} flash={flash} candidates={candidates} />
          </div>

          <div className="flex flex-col gap-3">
            <SectionHeader title="Status" />
            <SafetyFlashStatusToggle companyId={currentCompanyId} flashId={flash.id} projectId={flash.project_id} status={flash.status} />
          </div>

          <div className="flex flex-col gap-3">
            <SectionHeader title="Replace PDF" description="If an incorrect PDF was uploaded, replace it here. The previous file is retained, never overwritten." />
            <SafetyFlashReplaceFileForm companyId={currentCompanyId} flashId={flash.id} projectId={flash.project_id} />
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
