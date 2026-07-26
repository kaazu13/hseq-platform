"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZE_OPTIONS, totalPagesFor, type PageSize } from "@/lib/pagination";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem } from "@/components/ui/pagination";

type PaginationBarProps = {
  page: number;
  pageSize: PageSize;
  totalCount: number;
  /** Plural noun for the summary text, e.g. "employees" → "Showing 1–25 of 143 employees". */
  itemLabel: string;
};

/**
 * Generic, domain-agnostic server-side pagination control — reads/writes
 * the `page`/`pageSize` URL search params, preserving every other param
 * untouched (it doesn't need to know what `search`/`employmentStatus`/etc.
 * mean, only that they should survive a page change). Pairs with
 * lib/pagination.ts on the server side. Built for the employees list
 * (Employee Management Polish milestone's correction pass) but intended
 * for reuse by any future paginated list — the recruiter/Talent Pool
 * lists documented in docs/PRODUCT_REQUIREMENTS.md §11.6, once actually
 * built, should render this same component rather than a bespoke one.
 *
 * Page/prev/next links are real `<Link>`s (via `Button`'s `render` prop,
 * the same `nativeButton={false}` pattern used throughout this app) built
 * from the current URL — bookmarkable/shareable/back-forward-safe, not
 * onClick-driven navigation. The page-size `Select` can't be a plain link
 * (it's a dropdown, not a set of discrete hrefs to choose between per
 * option in the same way), so it pushes via the router like
 * `employee-filters.tsx`'s other controls.
 */
export function PaginationBar({ page, pageSize, totalCount, itemLabel }: PaginationBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalPages = totalPagesFor(totalCount, pageSize);

  function hrefFor(nextPage: number, nextPageSize?: PageSize): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    if (nextPageSize) params.set("pageSize", String(nextPageSize));
    return `${pathname}?${params.toString()}`;
  }

  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  // A small window of page numbers around the current one, always
  // including the first and last page — with an ellipsis standing in for
  // whatever's skipped, rather than rendering every page number when
  // there are many.
  const windowSize = 1;
  const pageNumbers = new Set<number>();
  pageNumbers.add(1);
  pageNumbers.add(totalPages);
  for (let n = page - windowSize; n <= page + windowSize; n++) {
    if (n >= 1 && n <= totalPages) pageNumbers.add(n);
  }
  const sortedPages = Array.from(pageNumbers).sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {totalCount === 0 ? `No ${itemLabel}` : `Showing ${start}–${end} of ${totalCount} ${itemLabel}`}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              router.push(hrefFor(1, Number(value) as PageSize));
            }}
          >
            <SelectTrigger size="sm" className="w-20" aria-label="Employees per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              {page <= 1 ? (
                <Button variant="ghost" size="sm" disabled aria-label="Go to previous page">
                  <ChevronLeft />
                  <span className="hidden sm:block">Previous</span>
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={hrefFor(page - 1)} aria-label="Go to previous page" />}
                >
                  <ChevronLeft />
                  <span className="hidden sm:block">Previous</span>
                </Button>
              )}
            </PaginationItem>

            {sortedPages.map((pageNumber, index) => {
              const previous = sortedPages[index - 1];
              const showEllipsisBefore = previous !== undefined && pageNumber - previous > 1;
              return (
                <PaginationItem key={pageNumber} className="flex items-center">
                  {showEllipsisBefore && <PaginationEllipsis />}
                  {pageNumber === page ? (
                    <Button variant="outline" size="icon-sm" aria-current="page" disabled>
                      {pageNumber}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      nativeButton={false}
                      render={<Link href={hrefFor(pageNumber)} aria-label={`Go to page ${pageNumber}`} />}
                    >
                      {pageNumber}
                    </Button>
                  )}
                </PaginationItem>
              );
            })}

            <PaginationItem>
              {page >= totalPages ? (
                <Button variant="ghost" size="sm" disabled aria-label="Go to next page">
                  <span className="hidden sm:block">Next</span>
                  <ChevronRight />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={hrefFor(page + 1)} aria-label="Go to next page" />}
                >
                  <span className="hidden sm:block">Next</span>
                  <ChevronRight />
                </Button>
              )}
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
