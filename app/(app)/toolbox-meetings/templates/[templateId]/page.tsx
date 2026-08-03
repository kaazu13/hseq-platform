import { forbidden, notFound } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentOrganization } from "@/modules/organizations/queries";
import { getToolboxTemplate, getToolboxTemplatePreviewUrl, listToolboxTemplateFileReplacements } from "@/modules/toolbox-templates/queries";
import { canManageToolboxTemplate, canViewToolboxTemplate } from "@/modules/toolbox-templates/permissions";
import { HSEQ_DOCUMENT_CATEGORY_LABELS } from "@/modules/toolbox-templates/types";
import { ToolboxTemplateEditForm } from "@/modules/toolbox-templates/components/toolbox-template-edit-form";
import { ToolboxTemplateStatusToggle } from "@/modules/toolbox-templates/components/toolbox-template-status-toggle";
import { ToolboxTemplateReplaceFileForm } from "@/modules/toolbox-templates/components/toolbox-template-replace-file-form";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { ToolboxDocumentStatusBadge } from "@/components/shared/toolbox-document-status-badge";
import { PdfPreview } from "@/components/shared/pdf-preview";
import { Card, CardContent } from "@/components/ui/card";

type ToolboxTemplateDetailPageProps = {
  params: Promise<{ templateId: string }>;
};

export default async function ToolboxTemplateDetailPage({ params }: ToolboxTemplateDetailPageProps) {
  const { templateId } = await params;
  const { user } = await requireUser();
  const { currentOrganizationId } = await resolveCurrentOrganization(user.id);

  if (!currentOrganizationId) {
    forbidden();
  }

  const roleNames = await getUserRoleNames(currentOrganizationId);
  if (!canViewToolboxTemplate(roleNames)) {
    forbidden();
  }

  const template = await getToolboxTemplate(currentOrganizationId, templateId);
  if (!template) {
    notFound();
  }

  const [previewUrl, replacements] = await Promise.all([getToolboxTemplatePreviewUrl(template.storage_object_path), listToolboxTemplateFileReplacements(template.id)]);
  const canManage = canManageToolboxTemplate(roleNames);

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6">
      <PageHeader title={template.title} description={HSEQ_DOCUMENT_CATEGORY_LABELS[template.category]} actions={<ToolboxDocumentStatusBadge status={template.status} />} />

      <Card>
        <CardContent className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Language</p>
            <p className="text-sm font-medium">{template.language}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Uploaded</p>
            <p className="text-sm font-medium">{new Date(template.uploaded_at).toLocaleString()}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">Description</p>
            <p className="text-sm font-medium">{template.description ?? "—"}</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <SectionHeader title="Template PDF" />
        <PdfPreview signedUrl={previewUrl} filename={template.original_filename} />
      </div>

      {canManage && (
        <>
          <div className="flex flex-col gap-3">
            <SectionHeader title="Edit details" />
            <ToolboxTemplateEditForm organizationId={currentOrganizationId} template={template} />
          </div>

          <div className="flex flex-col gap-3">
            <SectionHeader title="Status" />
            <ToolboxTemplateStatusToggle organizationId={currentOrganizationId} templateId={template.id} status={template.status} />
          </div>

          <div className="flex flex-col gap-3">
            <SectionHeader title="Upload a new version" description="Replaces the current PDF with a controlled new version. The previous version is retained, never overwritten." />
            <ToolboxTemplateReplaceFileForm organizationId={currentOrganizationId} templateId={template.id} />
          </div>
        </>
      )}

      {replacements.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionHeader title="Version history" />
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
