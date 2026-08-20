"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

type LocationPickerMapProps = {
  initialLatitude: number | null;
  initialLongitude: number | null;
  siteCenter?: { latitude: number; longitude: number } | null;
  onPick: (latitude: number, longitude: number) => void;
};

/**
 * Part 7 — the interactive "tap/click to place a marker" map picker,
 * reusing the SAME Leaflet/OpenStreetMap architecture as ScaffoldMapView
 * (no new provider, no API key). Unlike that read-only multi-marker
 * component, this one is single-marker, draggable, and click-to-move —
 * it never auto-tracks the browser's position continuously (that's the
 * separate, explicit-permission "Use current location" button in
 * ScaffoldLocationPicker, not this component).
 */
export function LocationPickerMap({ initialLatitude, initialLongitude, siteCenter, onPick }: LocationPickerMapProps) {
  const t = useTranslations("ScaffoldMap");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const onPickRef = useRef(onPick);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    let cancelled = false;
    import("leaflet")
      .then((L) => {
        if (cancelled || !containerRef.current) return;

        const startCenter: [number, number] =
          initialLatitude != null && initialLongitude != null
            ? [initialLatitude, initialLongitude]
            : siteCenter
              ? [siteCenter.latitude, siteCenter.longitude]
              : [20, 0];
        const startZoom = initialLatitude != null || siteCenter ? 16 : 2;

        const map = L.map(containerRef.current, { zoomControl: true }).setView(startCenter, startZoom);
        mapRef.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);

        function placeMarker(latlng: import("leaflet").LatLng) {
          if (markerRef.current) {
            markerRef.current.setLatLng(latlng);
          } else {
            markerRef.current = L.marker(latlng, { draggable: true }).addTo(map!);
            markerRef.current.on("dragend", () => {
              const pos = markerRef.current!.getLatLng();
              onPickRef.current(pos.lat, pos.lng);
            });
          }
          onPickRef.current(latlng.lat, latlng.lng);
        }

        if (initialLatitude != null && initialLongitude != null) {
          placeMarker(L.latLng(initialLatitude, initialLongitude));
        }

        map.on("click", (event: import("leaflet").LeafletMouseEvent) => {
          placeMarker(event.latlng);
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError(t("mapLoadError"));
      });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately mount-once: re-running on every onPick/initial-value change would recreate the map and lose in-progress marker placement
  }, []);

  if (loadError) {
    return <div className="flex h-64 items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground sm:h-80">{loadError}</div>;
  }

  return <div ref={containerRef} className="h-64 w-full touch-manipulation rounded-lg border sm:h-80" role="application" aria-label={t("mapAriaLabel")} />;
}
