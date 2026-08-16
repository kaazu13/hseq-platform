import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Generic Prev/Next pager for platform-admin list pages — same
 * server-rendered-links shape as modules/lmra/components/lmra-pagination.tsx
 * (no client state), generalized to any base path + extra query params +
 * a known totalCount/pageSize (every platform_admin_list_* RPC already
 * returns total_count via a window function, so pages here always know
 * the real page count up front, unlike LMRA's "fetch one row past the
 * page size" approach).
 */
export function AdminPagination({
  basePath,
  page,
  pageSize,
  totalCount,
  extraParams,
}: {
  basePath: string;
  page: number;
  pageSize: number;
  totalCount: number;
  extraParams?: Record<string, string | undefined>;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) return null;

  function hrefFor(targetPage: number): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(extraParams ?? {})) {
      if (value) params.set(key, value);
    }
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <div className="flex items-center justify-between gap-2 pt-2">
      <Button variant="outline" size="sm" nativeButton={false} disabled={page <= 1} render={<a href={page > 1 ? hrefFor(page - 1) : undefined} />}>
        <ChevronLeft />
        Previous
      </Button>
      <span className="text-sm text-muted-foreground">
        Page {page} of {totalPages} ({totalCount} total)
      </span>
      <Button variant="outline" size="sm" nativeButton={false} disabled={page >= totalPages} render={<a href={page < totalPages ? hrefFor(page + 1) : undefined} />}>
        Next
        <ChevronRight />
      </Button>
    </div>
  );
}
