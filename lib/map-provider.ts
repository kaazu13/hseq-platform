/**
 * Scaffold Map provider abstraction (Part W) — chosen via environment
 * configuration, never a hard-coded key. Documented required env vars:
 *
 *   NEXT_PUBLIC_MAP_PROVIDER        "leaflet" (default) | "google"
 *   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY required only when provider="google"
 *
 * Today, only "leaflet" (OpenStreetMap tiles via the leaflet package,
 * MIT-licensed, no API key or billing account needed) is actually
 * implemented — see components/shared/scaffold-map-view.tsx. Choosing
 * "google" without a configured key resolves to `unconfigured` rather
 * than crashing the page; a real Google Maps provider implementation is
 * intentionally left for a future pass (documented, not built, per this
 * task's explicit "if this materially expands scope: implement schema/
 * provider foundation only" allowance) — the abstraction here is what
 * that future implementation would plug into.
 */
export type MapProviderConfig = { provider: "leaflet" } | { provider: "google"; apiKey: string } | { provider: "unconfigured"; requestedProvider: string };

export function getMapProviderConfig(): MapProviderConfig {
  const requested = process.env.NEXT_PUBLIC_MAP_PROVIDER?.trim().toLowerCase() || "leaflet";

  if (requested === "leaflet") return { provider: "leaflet" };

  if (requested === "google") {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
    // Not yet implemented (see this file's header comment) — always
    // resolves to unconfigured, even with a key present, until a real
    // Google Maps provider component exists.
    if (apiKey) return { provider: "unconfigured", requestedProvider: "google" };
    return { provider: "unconfigured", requestedProvider: "google" };
  }

  return { provider: "unconfigured", requestedProvider: requested };
}
