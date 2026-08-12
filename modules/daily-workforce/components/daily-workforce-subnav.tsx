import Link from "next/link";
import { cn } from "@/lib/utils";

type DailyWorkforceSubnavProps = {
  companyId: string;
  projectId: string;
  active: "teams" | "absences" | "leave";
};

/** "[ Teams ] [ Absent Today ] [ Holiday / Leave ]" — shared sub-navigation across the three Planning & Daily workforce pages (Phase 4). */
export function DailyWorkforceSubnav({ companyId, projectId, active }: DailyWorkforceSubnavProps) {
  const base = `/companies/${companyId}/projects/${projectId}`;
  const items = [
    { key: "teams", label: "Teams", href: `${base}/teams` },
    { key: "absences", label: "Absent Today", href: `${base}/absences` },
    { key: "leave", label: "Holiday / Leave", href: `${base}/leave` },
  ] as const;

  return (
    <div className="flex items-center gap-1 border-b">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            active === item.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
