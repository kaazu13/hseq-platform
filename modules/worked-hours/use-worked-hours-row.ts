"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { upsertWorkedHoursCategories } from "@/modules/worked-hours/actions";
import { WORKED_HOURS_CATEGORIES, WORKED_HOURS_MAX, type WorkedHoursWithEmployee, type WorkedHoursCategory } from "@/modules/worked-hours/types";

const EMPTY_BREAKDOWN: Record<WorkedHoursCategory, number> = { regular: 0, overtime: 0, night: 0, travel: 0, other: 0 };

/**
 * Item 2: shared save logic behind the compact Worked Hours Today
 * desktop table row and mobile expandable card — one place for the
 * "reason required to correct submitted hours" retry flow instead of
 * duplicating it in two layout-specific components.
 */
export function useWorkedHoursRow(companyId: string, projectId: string, workDate: string, employeeId: string, workedHours: WorkedHoursWithEmployee | null) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const initialBreakdown = workedHours?.breakdown ?? EMPTY_BREAKDOWN;
  const [values, setValues] = useState<Record<WorkedHoursCategory, string>>(
    Object.fromEntries(WORKED_HOURS_CATEGORIES.map((category) => [category, String(initialBreakdown[category])])) as Record<WorkedHoursCategory, string>,
  );
  const [note, setNote] = useState(workedHours?.note ?? "");
  const [reason, setReason] = useState("");
  const [needsReason, setNeedsReason] = useState(false);

  const isSubmitted = workedHours?.status === "submitted";
  const total = useMemo(() => WORKED_HOURS_CATEGORIES.reduce((sum, category) => sum + (Number(values[category]) || 0), 0), [values]);
  const overCap = total > WORKED_HOURS_MAX;

  function setCategory(category: WorkedHoursCategory, value: string) {
    setValues((prev) => ({ ...prev, [category]: value }));
  }

  function save() {
    startTransition(async () => {
      const result = await upsertWorkedHoursCategories(companyId, projectId, employeeId, workDate, {
        categories: { regular: values.regular, overtime: values.overtime, night: values.night, travel: values.travel, other: values.other },
        note: note || undefined,
        reason: reason || undefined,
      });
      if (!result.ok) {
        if (result.error.message.toLowerCase().includes("reason is required")) {
          setNeedsReason(true);
          toast.error(result.error.message);
          return;
        }
        toast.error(result.error.message);
        return;
      }
      toast.success("Hours saved.");
      setReason("");
      setNeedsReason(false);
      router.refresh();
    });
  }

  return { values, setCategory, note, setNote, reason, setReason, needsReason, isSubmitted, total, overCap, isPending, save };
}
