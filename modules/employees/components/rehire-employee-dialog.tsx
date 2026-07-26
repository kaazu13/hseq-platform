"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { UserCheck } from "lucide-react";
import { toast } from "sonner";
import { rehireEmployee } from "@/modules/employees/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RehireEmployeeDialogProps = {
  organizationId: string;
  employeeId: string;
  employeeName: string;
};

const TODAY = () => new Date().toISOString().slice(0, 10);

/**
 * Opens a new employment period for a previously-terminated employee —
 * modules/employees/actions.ts's `rehireEmployee`. Creates a new
 * employee_employment_periods row, never a new employees row, so the
 * employee number and every other field on the record carry over
 * unchanged (see that Server Function's comment).
 */
export function RehireEmployeeDialog({ organizationId, employeeId, employeeName }: RehireEmployeeDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await rehireEmployee(organizationId, employeeId, {
        startDate: String(formData.get("startDate") ?? ""),
      });
      if (!result.ok) {
        toast.error(result.error.message);
        setFieldErrors(result.error.fieldErrors ?? {});
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <UserCheck />
            Rehire
          </Button>
        }
      />
      <DialogContent>
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Rehire {employeeName}?</DialogTitle>
            <DialogDescription>
              Starts a new employment period on their existing record — their employee number, roles history, and prior
              employment periods are kept exactly as they are.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="startDate">Start date</Label>
              <Input
                id="startDate"
                name="startDate"
                type="date"
                required
                defaultValue={TODAY()}
                aria-invalid={Boolean(fieldErrors.startDate)}
              />
              {fieldErrors.startDate && <p className="text-sm text-destructive">{fieldErrors.startDate}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Rehiring…" : "Rehire"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
