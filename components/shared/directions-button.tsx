import { Navigation } from "lucide-react";
import { buildDirectionsUrl } from "@/lib/directions";
import { Button } from "@/components/ui/button";

type DirectionsButtonProps = {
  siteLatitude: number | null;
  siteLongitude: number | null;
  siteAddress: string | null;
  size?: "sm" | "default";
};

/** "Get Directions" — Task 3 Part 14. Renders nothing when the project has no site location set, rather than a disabled/dead button. */
export function DirectionsButton({ siteLatitude, siteLongitude, siteAddress, size = "sm" }: DirectionsButtonProps) {
  const url = buildDirectionsUrl({ siteLatitude, siteLongitude, siteAddress });
  if (!url) return null;

  return (
    <Button variant="outline" size={size} nativeButton={false} render={<a href={url} target="_blank" rel="noopener noreferrer" />}>
      <Navigation />
      Directions
    </Button>
  );
}
