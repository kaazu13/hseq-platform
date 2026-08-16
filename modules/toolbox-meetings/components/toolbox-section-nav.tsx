import Link from "next/link";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { key: "meetings", label: "Toolbox Meetings", href: "/toolbox-meetings" },
  { key: "templates", label: "Toolbox Templates", href: "/toolbox-meetings?section=templates" },
  { key: "safety-flash", label: "Safety Flash", href: "/toolbox-meetings?section=safety-flash" },
] as const;

export type ToolboxSection = (typeof SECTIONS)[number]["key"];

/**
 * The three-section switcher for the single "Toolbox Meetings" nav area
 * (docs' explicit "one main navigation area... inside it, provide three
 * sections" structure). A plain `?section=` query param, not the Tabs
 * primitive — each section fetches its own data server-side on
 * navigation (no client-side panel toggling of pre-fetched data), so a
 * user only ever pays for the section they're actually viewing, and each
 * section has its own shareable URL.
 */
export function ToolboxSectionNav({ active, hideTemplates }: { active: ToolboxSection; hideTemplates?: boolean }) {
  const visibleSections = hideTemplates ? SECTIONS.filter((section) => section.key !== "templates") : SECTIONS;
  return (
    <div className="inline-flex w-fit flex-wrap items-center gap-1 rounded-lg bg-muted p-1">
      {visibleSections.map((section) => (
        <Link
          key={section.key}
          href={section.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
            active === section.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {section.label}
        </Link>
      ))}
    </div>
  );
}
