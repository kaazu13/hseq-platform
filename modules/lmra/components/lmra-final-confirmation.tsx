"use client";

import { ShieldCheck, ShieldX } from "lucide-react";
import type { LmraResult } from "@/modules/lmra/types";
import { SectionHeader } from "@/components/shared/section-header";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type LmraFinalConfirmationProps = {
  result: LmraResult;
  onResultChange: (result: LmraResult) => void;
  stopWorkReason: string;
  onStopWorkReasonChange: (value: string) => void;
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
  stopWorkReasonError?: string;
  confirmedError?: string;
  disabled?: boolean;
};

/**
 * Final Confirmation (Phase 6) — the on-site go/no-go call (unchanged from
 * the existing LmraSubmitCard's UX, just folded into the same form instead
 * of a separate post-creation step — see modules/lmra/components/lmra-submit-card.tsx,
 * still used unchanged for the "finish a draft saved earlier" path) plus
 * the new required acknowledgement checkbox. Only rendered/required when
 * the caller is about to "Save LMRA" (not "Save Draft") — see lmra-form.tsx.
 */
export function LmraFinalConfirmation({
  result,
  onResultChange,
  stopWorkReason,
  onStopWorkReasonChange,
  confirmed,
  onConfirmedChange,
  stopWorkReasonError,
  confirmedError,
  disabled,
}: LmraFinalConfirmationProps) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <SectionHeader title="Final Confirmation" />

      <div className="flex flex-col gap-1.5">
        <Label>Go / no-go decision</Label>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onResultChange("go")}
            aria-pressed={result === "go"}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              result === "go" ? "border-emerald-600 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "hover:bg-muted/50",
            )}
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
            Go
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onResultChange("no_go")}
            aria-pressed={result === "no_go"}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              result === "no_go" ? "border-destructive bg-destructive/10 text-destructive" : "hover:bg-muted/50",
            )}
          >
            <ShieldX className="size-4" aria-hidden="true" />
            No-go — stop work
          </button>
        </div>
      </div>

      {result === "no_go" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stopWorkReason">Reason for stopping work</Label>
          <Textarea
            id="stopWorkReason"
            rows={3}
            disabled={disabled}
            value={stopWorkReason}
            onChange={(event) => onStopWorkReasonChange(event.target.value)}
            aria-invalid={Boolean(stopWorkReasonError)}
            maxLength={2000}
          />
          {stopWorkReasonError && <p className="text-sm text-destructive">{stopWorkReasonError}</p>}
        </div>
      )}

      <div className="flex items-start gap-2">
        <Checkbox id="confirmed" checked={confirmed} disabled={disabled} onCheckedChange={(checked) => onConfirmedChange(checked === true)} aria-invalid={Boolean(confirmedError)} />
        <Label htmlFor="confirmed" className="font-normal">
          I confirm that the hazards and required control measures have been discussed and understood before work starts.
        </Label>
      </div>
      {confirmedError && <p className="text-sm text-destructive">{confirmedError}</p>}
    </div>
  );
}
