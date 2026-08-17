/**
 * Task 3 Part 14 — builds a "Get Directions" link from a project's site
 * location. Google Maps' documented URL API (https://developers.google.com/maps/documentation/urls/get-started#directions-action)
 * — coordinates are preferred (unambiguous); the free-text address is only
 * a fallback when no coordinates are set.
 */
export function buildDirectionsUrl(location: { siteLatitude: number | null; siteLongitude: number | null; siteAddress: string | null }): string | null {
  if (location.siteLatitude !== null && location.siteLongitude !== null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${location.siteLatitude},${location.siteLongitude}`;
  }
  if (location.siteAddress && location.siteAddress.trim()) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(location.siteAddress.trim())}`;
  }
  return null;
}
