"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Loader2, Printer, RotateCcw } from "lucide-react";
import { archiveLmra, reopenLmra } from "@/modules/lmra/actions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type LmraDetailActionsProps = {
  companyId: string;
  lmraId: string;
  projectId: string;
  canReopen: boolean;
  canArchive: boolean;
};

/** Print (always available — the printable detail page is this same route, styled for print via globals.css), Reopen (approved/rejected → draft, for corrections), and Archive (HSE Manager only, confirmed — terminal, no un-archive path). */
export function LmraDetailActions({ companyId, lmraId, projectId, canReopen, canArchive }: LmraDetailActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [archiveOpen, setArchiveOpen] = useState(false);

  function handleReopen() {
    startTransition(async () => {
      await reopenLmra(companyId, lmraId, projectId);
      router.refresh();
    });
  }

  function handleArchive() {
    startTransition(async () => {
      await archiveLmra(companyId, lmraId);
      setArchiveOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2 print:hidden">
      <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
        <Printer />
        Print
      </Button>

      {canReopen && (
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleReopen}>
          {isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          Reopen
        </Button>
      )}

      {canArchive && (
        <Button type="button" variant="outline" size="sm" onClick={() => setArchiveOpen(true)}>
          <Archive />
          Archive
        </Button>
      )}

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this LMRA?</AlertDialogTitle>
            <AlertDialogDescription>
              It will no longer appear in the active list. This can&apos;t be undone from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => setArchiveOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={isPending} onClick={handleArchive}>
              {isPending ? <Loader2 className="animate-spin" /> : null}
              {isPending ? "Archiving…" : "Archive"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
