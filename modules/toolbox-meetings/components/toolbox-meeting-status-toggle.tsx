"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { setToolboxMeetingStatus } from "@/modules/toolbox-meetings/actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ToolboxDocumentStatus } from "@/modules/toolbox-meetings/types";

export function ToolboxMeetingStatusToggle({ organizationId, meetingId, projectId, status }: { organizationId: string; meetingId: string; projectId: string; status: ToolboxDocumentStatus }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    const nextStatus = status === "active" ? "archived" : "active";
    startTransition(async () => {
      const result = await setToolboxMeetingStatus(organizationId, meetingId, projectId, nextStatus);
      if (!result.ok) setError(result.error.message);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={toggle}>
        {isPending ? <Loader2 className="animate-spin" /> : status === "active" ? <Archive /> : <ArchiveRestore />}
        {status === "active" ? "Archive" : "Restore to active"}
      </Button>
    </div>
  );
}
