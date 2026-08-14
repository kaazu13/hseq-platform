import Link from "next/link";
import { Rocket } from "lucide-react";
import { buildOnboardingChecklistItems } from "@/modules/onboarding/types";
import type { OnboardingChecklist } from "@/modules/onboarding/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** A compact nudge on Your Dashboard — only rendered while onboarding's core items are incomplete (see isOnboardingCoreComplete's own caller in app/(app)/dashboard/page.tsx), so it disappears once a company no longer needs it (item 26). */
export function OnboardingBanner({ checklist }: { checklist: OnboardingChecklist }) {
  const remaining = buildOnboardingChecklistItems(checklist).filter((item) => !item.done);

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
        <div className="flex items-center gap-3">
          <Rocket className="size-5 text-primary" />
          <div>
            <p className="text-sm font-medium">Finish setting up {checklist.companyName}</p>
            <p className="text-xs text-muted-foreground">{remaining.length} step{remaining.length === 1 ? "" : "s"} left: {remaining.map((item) => item.label).join(", ")}</p>
          </div>
        </div>
        <Button size="sm" nativeButton={false} render={<Link href="/onboarding" />}>
          Continue setup
        </Button>
      </CardContent>
    </Card>
  );
}
