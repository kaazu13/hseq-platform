"use client";

import { useRouter } from "next/navigation";
import { ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import { restoreEmployee } from "@/modules/employees/actions";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";

type RestoreEmployeeButtonProps = {
  companyId: string;
  employeeId: string;
  employeeName: string;
};

/**
 * The inverse of `ArchiveEmployeeButton` — shown instead of it whenever an
 * employee's `archived_at` is not null (see docs/PRODUCT_REQUIREMENTS.md,
 * Employee Management Polish milestone §5). `archived_at`, not
 * `account_status`, is the authoritative record-archive signal — see the
 * correction report. Confirmation is required for symmetry with
 * archiving, even though restoring is the less destructive direction — it
 * still changes a status other views (filters, the roles tab) depend on.
 */
export function RestoreEmployeeButton({ companyId, employeeId, employeeName }: RestoreEmployeeButtonProps) {
  const router = useRouter();

  async function handleConfirm() {
    const result = await restoreEmployee(companyId, employeeId);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <ConfirmDialog
      title="Restore this employee?"
      description={`${employeeName} will reappear in the default employee list. Their account status returns to Draft — restoring does not create or activate a login.`}
      confirmLabel="Restore"
      onConfirm={handleConfirm}
      trigger={
        <Button variant="outline" size="sm">
          <ArchiveRestore />
          Restore
        </Button>
      }
    />
  );
}
