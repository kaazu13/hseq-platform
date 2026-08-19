"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { InspectionHealthState } from "@/modules/scaffolds/inspection-health";

export type ScaffoldMapMarker = {
  scaffoldId: string;
  scaffoldNumber: number;
  workArea: string;
  latitude: number;
  longitude: number;
  healthState: InspectionHealthState;
  healthLabel: string;
  frequencyLabel: string;
  lastInspectionLabel: string | null;
  inspectorName: string | null;
  nextDueLabel: string | null;
  scaffoldHref: string;
  inspectionHref: string | null;
  inspectHref: string | null;
};

const MARKER_COLOR: Record<InspectionHealthState, string> = {
  valid: "#16a34a",
  expiring_tomorrow: "#f59e0b",
  due_today: "#dc2626",
  expired: "#dc2626",
  awaiting_initial: "#6b7280",
  dismantled: "#9ca3af",
};

function buildPopupHtml(marker: ScaffoldMapMarker, labels: { viewScaffold: string; viewInspection: string; inspect: string; frequency: string; lastInspection: string; nextDue: string }): string {
  const lines: string[] = [
    `<div style="font:600 13px system-ui;margin-bottom:2px">SC-${String(marker.scaffoldNumber).padStart(5, "0")}</div>`,
    `<div style="font:12px system-ui;color:#666;margin-bottom:6px">${escapeHtml(marker.workArea)}</div>`,
    `<div style="font:600 12px system-ui;color:${MARKER_COLOR[marker.healthState]};margin-bottom:4px">${escapeHtml(marker.healthLabel)}</div>`,
    `<div style="font:11px system-ui;color:#444">${escapeHtml(labels.frequency)}: ${escapeHtml(marker.frequencyLabel)}</div>`,
  ];
  if (marker.lastInspectionLabel) lines.push(`<div style="font:11px system-ui;color:#444">${escapeHtml(labels.lastInspection)}: ${escapeHtml(marker.lastInspectionLabel)}${marker.inspectorName ? ` · ${escapeHtml(marker.inspectorName)}` : ""}</div>`);
  if (marker.nextDueLabel) lines.push(`<div style="font:11px system-ui;color:#444">${escapeHtml(labels.nextDue)}: ${escapeHtml(marker.nextDueLabel)}</div>`);

  const actions: string[] = [`<a href="${marker.scaffoldHref}" style="color:#2563eb;font:600 11px system-ui;text-decoration:none">${escapeHtml(labels.viewScaffold)}</a>`];
  if (marker.inspectionHref) actions.push(`<a href="${marker.inspectionHref}" style="color:#2563eb;font:600 11px system-ui;text-decoration:none">${escapeHtml(labels.viewInspection)}</a>`);
  if (marker.inspectHref) actions.push(`<a href="${marker.inspectHref}" style="color:#2563eb;font:600 11px system-ui;text-decoration:none">${escapeHtml(labels.inspect)}</a>`);

  return `<div style="min-width:180px">${lines.join("")}<div style="display:flex;gap:10px;margin-top:8px">${actions.join("")}</div></div>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

/**
 * Scaffold Map — Leaflet + OpenStreetMap tiles (Part W), no API key
 * needed. Leaflet touches `window`/`document` at import time, so it's
 * dynamically imported inside an effect rather than at module scope —
 * this component only ever renders client-side (its parent page never
 * imports it directly in a server context; see the Scaffold Map page's
 * dynamic(() => import(...), { ssr: false }) usage).
 */
export function ScaffoldMapView({ markers, siteCenter }: { markers: ScaffoldMapMarker[]; siteCenter?: { latitude: number; longitude: number } }) {
  const t = useTranslations("ScaffoldMap");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("leaflet")
      .then((L) => {
        if (cancelled || !containerRef.current) return;
        // Leaflet's default marker icon assets are excluded by Next.js's
        // bundler unless referenced this way — colored circle markers
        // (L.circleMarker) are used instead below, so no icon asset
        // wiring is needed at all.
        const map = L.map(containerRef.current, { zoomControl: true });
        mapRef.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);

        const labels = { viewScaffold: t("viewScaffold"), viewInspection: t("viewInspection"), inspect: t("inspect"), frequency: t("frequency"), lastInspection: t("lastInspection"), nextDue: t("nextDue") };
        const points: [number, number][] = [];

        for (const marker of markers) {
          const point: [number, number] = [marker.latitude, marker.longitude];
          points.push(point);
          L.circleMarker(point, {
            radius: 9,
            color: "#fff",
            weight: 2,
            fillColor: MARKER_COLOR[marker.healthState],
            fillOpacity: 1,
          })
            .addTo(map)
            .bindPopup(buildPopupHtml(marker, labels));
        }

        if (siteCenter) points.push([siteCenter.latitude, siteCenter.longitude]);

        if (points.length > 0) {
          map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 18 });
        } else {
          map.setView([0, 0], 2);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(t("mapLoadError"));
      });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markers/siteCenter intentionally re-create the whole map on change (a targeted diff-update isn't worth the complexity for this dataset size)
  }, [markers, siteCenter]);

  if (loadError) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground sm:h-96">
        {loadError}
      </div>
    );
  }

  return <div ref={containerRef} className="h-80 w-full rounded-lg border sm:h-[28rem]" role="application" aria-label={t("mapAriaLabel")} />;
}
