"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ALL_NAV_ITEMS, isNavItemActive } from "@/components/app-shell/nav-config";

/**
 * Derives the breadcrumb trail from the current route and the shared nav
 * config (components/app-shell/nav-config.ts) — one source of truth for
 * "what this route is called," rather than every page passing its own
 * breadcrumb props. Every route in this milestone is a single level deep
 * (flat nav, no dynamic segments yet), so the trail is always exactly
 * "App / <current page>" today; it's built to extend naturally once a
 * route like /projects/[projectId] exists (append segments as they're
 * matched, rather than redesigning this component).
 */
export function Breadcrumbs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("Nav");
  const current = ALL_NAV_ITEMS.find((item) => isNavItemActive(item, pathname, searchParams));
  const currentLabel = current?.id ? t(`items.${current.id}.label`) : current?.label;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden sm:block">
          <BreadcrumbLink render={<Link href="/dashboard">HSEQ Platform</Link>} />
        </BreadcrumbItem>
        {current ? (
          <>
            <BreadcrumbSeparator className="hidden sm:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{currentLabel}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
