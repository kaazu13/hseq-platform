"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { addDailyTeamForeman } from "@/modules/daily-workforce/actions";
import { ForemanPickerDialog } from "@/modules/daily-workforce/components/foreman-picker-dialog";
import type { EmployeeDailyState } from "@/modules/daily-workforce/types";
import { Button } from "@/components/ui/button";

type AddForemanButtonProps = {
  companyId: string;
  projectId: string;
  workDate: string;
  workforce: EmployeeDailyState[];
  rosterForemanIds: string[];
};

/**
 * Item 4: "+ Add Foreman" — establishes an eligible, available project
 * Foreman as part of today's operational workforce structure. This alone
 * creates no team; a Foreman may then have zero, one, or multiple teams.
 * Already-rostered Foremen are excluded from the picker (never offered as
 * a duplicate add).
 */
export function AddForemanButton({ companyId, projectId, workDate, workforce, rosterForemanIds }: AddForemanButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleSelect(employeeId: string) {
    startTransition(async () => {
      const result = await addDailyTeamForeman(companyId, projectId, workDate, { foremanEmployeeId: employeeId });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" disabled={isPending} onClick={() => setOpen(true)}>
        <UserPlus />
        Add Foreman
      </Button>
      <ForemanPickerDialog
        open={open}
        onOpenChange={setOpen}
        title="Add foreman to today's teams"
        description="Only employees holding this project's Foreman role are shown."
        workforce={workforce}
        excludeEmployeeIds={rosterForemanIds}
        onSelect={handleSelect}
      />
    </>
  );
}
