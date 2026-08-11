"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Share2, Copy, Check, Loader2 } from "lucide-react";
import { createReportShare, revokeReportShare } from "@/modules/reports/actions";
import { getReportShareStatus, REPORT_SHARE_STATUS_LABELS, resolveShareExpiryPreset, SHARE_EXPIRY_PRESET_LABELS, type ReportShare, type ReportRecordType, type ShareExpiryPreset } from "@/modules/reports/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

type ShareReportDialogProps = {
  companyId: string;
  projectId: string | null;
  recordType: ReportRecordType;
  recordId: string;
  initialShares: ReportShare[];
};

const EXPIRY_PRESETS: ShareExpiryPreset[] = ["24h", "7d", "30d", "none"];

function statusTone(status: ReturnType<typeof getReportShareStatus>): "default" | "secondary" | "destructive" {
  if (status === "active") return "default";
  if (status === "revoked") return "destructive";
  return "secondary";
}

function formatDateTime(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * "[ Share ]" — create/copy/revoke read-only external links for one
 * record. A freshly created token is shown exactly once (create_report_share()
 * never persists the plaintext — see the migration's header comment), so
 * it's held only in local component state until the dialog closes.
 * Reused across all six record types' view pages.
 */
export function ShareReportDialog({ companyId, projectId, recordType, recordId, initialShares }: ShareReportDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [preset, setPreset] = useState<ShareExpiryPreset>("7d");
  const [newLink, setNewLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function shareUrl(token: string): string {
    return `${window.location.origin}/share/${token}`;
  }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const expiresAt = resolveShareExpiryPreset(preset);
      const result = await createReportShare(companyId, projectId, { recordType, recordId, expiresAt });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setNewLink(shareUrl(result.data.token));
      router.refresh();
    });
  }

  function handleRevoke(shareId: string) {
    startTransition(async () => {
      const result = await revokeReportShare(companyId, shareId);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Share link revoked.");
      router.refresh();
    });
  }

  async function handleCopy(link: string) {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setNewLink(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Share2 />
        Share
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share this report</DialogTitle>
          <DialogDescription>Anyone with the link can view a read-only copy of this report. They do not need an account.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {newLink && (
            <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/50 p-3">
              <p className="text-xs font-medium text-muted-foreground">Copy this link now — for security, it won&apos;t be shown again.</p>
              <div className="flex items-center gap-2">
                <input readOnly value={newLink} className="w-full truncate rounded-md border bg-background px-2 py-1 text-xs" onFocus={(event) => event.currentTarget.select()} />
                <Button type="button" size="icon-sm" variant="outline" onClick={() => handleCopy(newLink)}>
                  {copied ? <Check /> : <Copy />}
                </Button>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Expires</span>
              <Select value={preset} onValueChange={(value) => setPreset(value as ShareExpiryPreset)}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_PRESETS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {SHARE_EXPIRY_PRESET_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" size="sm" disabled={isPending} onClick={handleCreate}>
              {isPending && <Loader2 className="animate-spin" />}
              Create link
            </Button>
          </div>

          {initialShares.length > 0 && (
            <div className="flex flex-col gap-2 border-t pt-3">
              <span className="text-xs font-medium text-muted-foreground">Existing links</span>
              <div className="flex flex-col divide-y">
                {initialShares.map((share) => {
                  const status = getReportShareStatus(share);
                  return (
                    <div key={share.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <Badge variant={statusTone(status)}>{REPORT_SHARE_STATUS_LABELS[status]}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {share.view_count} view{share.view_count === 1 ? "" : "s"}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          Created {formatDateTime(share.created_at)} · Expires {formatDateTime(share.expires_at)}
                        </span>
                      </div>
                      {status === "active" && (
                        <ConfirmDialog
                          title="Revoke this share link?"
                          description="Anyone with this link will immediately lose access. This cannot be undone."
                          confirmLabel="Revoke"
                          variant="destructive"
                          onConfirm={() => handleRevoke(share.id)}
                          trigger={
                            <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                              Revoke
                            </Button>
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
