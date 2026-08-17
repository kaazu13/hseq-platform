"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateGreetingSetting } from "@/modules/greetings/actions";
import { GREETING_TYPE_LABELS, GREETING_PLACEHOLDER_HELP, type GreetingType } from "@/lib/greetings";
import type { CompanyGreetingSetting } from "@/modules/greetings/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type GreetingSettingCardProps = {
  companyId: string;
  setting: CompanyGreetingSetting;
};

/** One greeting type's toggle + editable message template — Task 3 Part 8. company_admin only; the page itself gates who reaches this component at all. */
export function GreetingSettingCard({ companyId, setting }: GreetingSettingCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(setting.enabled);
  const [template, setTemplate] = useState(setting.message_template);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function save(nextEnabled: boolean, nextTemplate: string) {
    setFieldError(null);
    startTransition(async () => {
      const result = await updateGreetingSetting(companyId, setting.greeting_type as GreetingType, { enabled: nextEnabled, messageTemplate: nextTemplate });
      if (!result.ok) {
        if (result.error.fieldErrors?.messageTemplate) setFieldError(result.error.fieldErrors.messageTemplate);
        else toast.error(result.error.message);
        return;
      }
      toast.success(`${GREETING_TYPE_LABELS[setting.greeting_type as GreetingType]} greeting updated.`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">{GREETING_TYPE_LABELS[setting.greeting_type as GreetingType]}</CardTitle>
        <div className="flex items-center gap-2">
          <Label htmlFor={`greeting-enabled-${setting.greeting_type}`} className="text-xs text-muted-foreground">
            {enabled ? "Enabled" : "Disabled"}
          </Label>
          <Switch
            id={`greeting-enabled-${setting.greeting_type}`}
            checked={enabled}
            disabled={isPending}
            onCheckedChange={(checked) => {
              setEnabled(checked);
              save(checked, template);
            }}
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Textarea
          value={template}
          onChange={(event) => setTemplate(event.target.value)}
          rows={3}
          maxLength={2000}
          aria-invalid={Boolean(fieldError)}
          disabled={isPending}
        />
        {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
        <p className="text-xs text-muted-foreground">{GREETING_PLACEHOLDER_HELP}</p>
        <div>
          <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => save(enabled, template)}>
            {isPending ? <Loader2 className="animate-spin" /> : null}
            {isPending ? "Saving…" : "Save message"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
