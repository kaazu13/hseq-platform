import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level loading state for every app/(app)/** page — see
 * docs/UI_GUIDELINES.md §6: "Skeleton matching the eventual layout... use
 * loading.tsx route conventions." Shaped like the dashboard (the densest
 * page in this milestone) so it reads as a plausible preview of whatever
 * page is loading, rather than a generic spinner.
 */
export default function AppLoading() {
  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-48 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
