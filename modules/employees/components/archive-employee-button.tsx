"use client";

import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { toast } from "sonner";
import { archiveEmployee } from "@/modules/employees/actions";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";

type ArchiveEmployeeButtonProps = {
  organizationId: string;
  employeeId: string;
  employeeName: string;
};

/**
 * Archive confirmation — see docs/UI_GUIDELINES.md §5's "destructive/
 * hard-to-reverse actions require an explicit confirmation step" rule. Not
 * actually a delete (the row stays forever — see
 * modules/employees/actions.ts's `archiveEmployee` comment) but hiding an
 * employee from every default view is disruptive enough to warrant the same
 * confirm-before-acting treatment. Uncontrolled trigger mode (see
 * components/shared/confirm-dialog.tsx) since this button is a standalone
 * trigger, not nested inside another overlay.
 */
export function ArchiveEmployeeButton({ organizationId, employeeId, employeeName }: ArchiveEmployeeButtonProps) {
  const router = useRouter();

  async function handleConfirm() {
    const result = await archiveEmployee(organizationId, employeeId);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <ConfirmDialog
      title="Archive this employee?"
      description={`${employeeName} will be hidden from the employee list by default. Their record is kept and can be revealed again with the archived filter.`}
      confirmLabel="Archive"
      variant="destructive"
      onConfirm={handleConfirm}
      trigger={
        <Button variant="outline" size="sm">
          <Archive />
          Archive
        </Button>
      }
    />
  );
}
