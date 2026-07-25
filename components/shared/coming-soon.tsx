import Link from "next/link";
import { ArrowLeft, Construction, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

type ComingSoonPageProps = {
  title: string;
  description: string;
  icon: LucideIcon;
};

/**
 * Shared placeholder for every nav item without a real module yet — see
 * docs/IMPLEMENTATION_PLAN.md M7.5 and the milestone's "routes must not
 * produce broken links" requirement. One component, reused by every
 * app/(app)/<module>/page.tsx that isn't built — see
 * components/app-shell/nav-config.ts for the descriptions each page
 * passes in.
 */
export function ComingSoonPage({ title, description, icon }: ComingSoonPageProps) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={icon}
        title={`${title} isn't built yet`}
        description="This area of the platform is planned but not implemented. Check back once this module ships."
        action={
          <Button variant="outline" size="sm" render={<Link href="/dashboard" />}>
            <ArrowLeft />
            Back to dashboard
          </Button>
        }
        className="flex-1"
      />
    </div>
  );
}

/** Generic fallback icon for placeholders that don't have a more specific one handy. */
export const ComingSoonIcon = Construction;
