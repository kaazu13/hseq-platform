import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type AccountSubnavProps = {
  active: "profile" | "requests" | "rates" | "security";
  showRates: boolean;
};

/**
 * Part 14 — Account's tabbed information architecture: "[ Profile ]
 * [ Requests ] [ Rates ] [ Security ]", same link-based subnav pattern as
 * DailyWorkforceSubnav (real navigable routes, not client-only tab state —
 * required so notification deep-links like /account/requests?type=leave&id=…
 * land directly on the right tab). Rates is hidden entirely for an account
 * with no linked employee record (nothing to show — see the Rates page's
 * own empty state for the "has an employee record but no rate set yet" case).
 */
export function AccountSubnav({ active, showRates }: AccountSubnavProps) {
  const t = useTranslations("Account");
  const items = [
    { key: "profile" as const, label: t("tabProfile"), href: "/account" },
    { key: "requests" as const, label: t("tabRequests"), href: "/account/requests" },
    ...(showRates ? [{ key: "rates" as const, label: t("tabRates"), href: "/account/rates" }] : []),
    { key: "security" as const, label: t("tabSecurity"), href: "/account/security" },
  ];

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={cn(
            "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            active === item.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
