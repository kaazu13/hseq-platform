import { CheckCircle2, Circle } from "lucide-react";
import { buildOnboardingChecklistItems } from "@/modules/onboarding/types";
import type { OnboardingChecklist as OnboardingChecklistData } from "@/modules/onboarding/types";
import { Card, CardContent } from "@/components/ui/card";

/** Items 3/26 — concrete counts and a checkmark/circle per item, never a percentage/score/streak (item 3's explicit "guidance, not gamification"). */
export function OnboardingChecklist({ checklist }: { checklist: OnboardingChecklistData }) {
  const items = buildOnboardingChecklistItems(checklist);

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-4">
        <p className="text-sm font-semibold">Company Setup</p>
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-2 text-sm">
              {item.done ? <CheckCircle2 className="size-4 shrink-0 text-green-600" /> : <Circle className="size-4 shrink-0 text-muted-foreground" />}
              <span className={item.done ? "" : "text-muted-foreground"}>{item.label}</span>
              {item.detail && <span className="text-xs text-muted-foreground">— {item.detail}</span>}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
