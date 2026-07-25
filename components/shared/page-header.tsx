import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
};

/**
 * Top-of-page title area — see docs/UI_GUIDELINES.md §8 ("Page header
 * with breadcrumbs" under components/shared/). The breadcrumb trail itself
 * lives above this (rendered once by the app shell, not per-page — see
 * components/app-shell/breadcrumbs.tsx) so every page only needs to supply
 * its own title/description/actions.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground text-balance">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
