"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Copy, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { previewEmployeeImport, commitEmployeeImport, type CommitEmployeeImportResult } from "@/modules/employees/actions";
import type { ImportPreview } from "@/modules/employees/import";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

type ProjectOption = { id: string; name: string };

/**
 * Items 9/10 — a 3-step client wizard: upload -> preview (server-validated,
 * nothing committed yet) -> commit (all-or-nothing). No client-side row
 * mutation of any kind — the exact `validRows` array the server already
 * validated is what gets sent to commitEmployeeImport unchanged, so the
 * server's re-validation inside import_employees_bulk() can never
 * disagree with what was shown on screen.
 */
export function EmployeeImportWizard({ companyId, projects }: { companyId: string; projects: ProjectOption[] }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<CommitEmployeeImportResult | null>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setPreview(null);
    setCommitted(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", file);
      const result = await previewEmployeeImport(companyId, formData);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setPreview(result.data);
    });
  }

  function handleCommit() {
    if (!preview || preview.validRows.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await commitEmployeeImport(companyId, projectId, preview.validRows);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setCommitted(result.data);
      toast.success(`Imported ${result.data.length} employees.`);
    });
  }

  function resetForAnotherImport() {
    setPreview(null);
    setCommitted(null);
    setFileName(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (committed) {
    const withInvites = committed.filter((row) => row.invitationToken);
    return (
      <Card>
        <CardContent className="flex flex-col gap-4 pt-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-green-600" />
            <p className="text-sm font-medium">Imported {committed.length} employees.</p>
          </div>
          {withInvites.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{withInvites.length} rows had an email — copy their invite links below (no email provider is configured, so nothing was sent automatically):</p>
              <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto rounded-md border p-2">
                {withInvites.map((row) => (
                  <div key={row.employeeId} className="flex items-center gap-2 text-xs">
                    <code className="flex-1 truncate">{row.employeeNumber}: {typeof window !== "undefined" ? `${window.location.origin}/accept-invite/${row.invitationToken}` : ""}</code>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/accept-invite/${row.invitationToken}`);
                        toast.success("Copied.");
                      }}
                    >
                      <Copy />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={resetForAnotherImport}>
              Import another file
            </Button>
            <Button type="button" nativeButton={false} render={<Link href="/employees" />}>
              View employees
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="import-file">Spreadsheet (.xlsx)</Label>
            <input
              ref={fileInputRef}
              id="import-file"
              type="file"
              accept=".xlsx"
              onChange={handleFileChange}
              disabled={isPending}
              className="text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
            />
            <p className="text-xs text-muted-foreground">Columns: Full Name (required), Email, Phone, Role, Position Title. Employee numbers are always assigned automatically.</p>
          </div>
          {fileName && !preview && !error && isPending && <p className="text-sm text-muted-foreground">Reading {fileName}…</p>}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-4">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-muted-foreground" />
              <p className="text-sm font-medium">Import Preview</p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="font-medium text-green-600">Valid: {preview.validRows.length}</span>
              <span className="font-medium text-destructive">Errors: {preview.errors.length}</span>
              <span className="text-muted-foreground">Total rows: {preview.totalRows}</span>
            </div>

            {preview.errors.length > 0 && (
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border p-2">
                {preview.errors.map((err, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 text-xs">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-600" />
                    <span>
                      Row {err.rowNumber}: {err.message}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {projects.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>Assign to project (optional)</Label>
                <Select value={projectId ?? ""} onValueChange={(value) => setProjectId(value || null)}>
                  <SelectTrigger className="w-full sm:w-64">
                    <SelectValue placeholder="No project assignment" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={resetForAnotherImport} disabled={isPending}>
                Choose a different file
              </Button>
              <Button type="button" disabled={isPending || preview.validRows.length === 0} onClick={handleCommit}>
                <Upload />
                {isPending ? "Importing…" : `Import ${preview.validRows.length} valid employees`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
