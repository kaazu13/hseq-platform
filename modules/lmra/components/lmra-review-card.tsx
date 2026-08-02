"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { reviewLmra } from "@/modules/lmra/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type LmraReviewCardProps = {
  organizationId: string;
  lmraId: string;
  projectId: string;
};

/** Review + approve/reject in one step (submitted → approved/rejected) — see modules/lmra/actions.ts's reviewLmra comment for why both decisions share one Server Function and one auth gate. */
export function LmraReviewCard({ organizationId, lmraId, projectId }: LmraReviewCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  function handleDecision(decision: "approved" | "rejected") {
    setFormError(null);
    startTransition(async () => {
      const result = await reviewLmra(organizationId, lmraId, projectId, { decision, reviewNotes });
      if (!result.ok) {
        setFormError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {formError && (
          <Alert variant="destructive" role="alert">
            <AlertCircle />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reviewNotes">Review notes (optional)</Label>
          <Textarea id="reviewNotes" rows={3} value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} />
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" disabled={isPending} onClick={() => handleDecision("approved")}>
            {isPending ? <Loader2 className="animate-spin" /> : null}
            Approve
          </Button>
          <Button type="button" variant="outline" disabled={isPending} onClick={() => handleDecision("rejected")}>
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
