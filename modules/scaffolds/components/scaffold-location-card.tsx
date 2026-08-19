"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { MapPin, Navigation, Pencil } from "lucide-react";
import type { ScaffoldMapMarker } from "@/components/shared/scaffold-map-view";
import type { InspectionHealthState } from "@/modules/scaffolds/inspection-health";
import { buildDirectionsUrl } from "@/lib/directions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const ScaffoldMapView = dynamic(() => import("@/components/shared/scaffold-map-view").then((m) => m.ScaffoldMapView), {
  ssr: false,
  loading: () => <div className="h-48 w-full animate-pulse rounded-lg border bg-muted/30" />,
});

type ScaffoldLocationCardProps = {
  scaffoldId: string;
  scaffoldNumber: number;
  workArea: string;
  latitude: number | null;
  longitude: number | null;
  healthState: InspectionHealthState;
  healthLabel: string;
  projectName: string;
  mapHref: string;
  editHref: string;
  canEdit: boolean;
};

/**
 * Part 1/2 — scaffold location on the detail page. Reuses the existing
 * latitude/longitude columns (Scaffold Map work) and the same Leaflet/
 * OpenStreetMap ScaffoldMapView component (a single-marker map here) — no
 * duplicate coordinate fields, no new map provider logic.
 */
export function ScaffoldLocationCard({ scaffoldId, scaffoldNumber, workArea, latitude, longitude, healthState, healthLabel, projectName, mapHref, editHref, canEdit }: ScaffoldLocationCardProps) {
  const t = useTranslations("ScaffoldMap");

  const hasLocation = latitude !== null && longitude !== null;
  const marker: ScaffoldMapMarker | null = hasLocation
    ? {
        scaffoldId,
        scaffoldNumber,
        workArea,
        latitude,
        longitude,
        healthState,
        healthLabel,
        frequencyLabel: "",
        lastInspectionLabel: null,
        inspectorName: null,
        nextDueLabel: null,
        scaffoldHref: "#",
        inspectionHref: null,
        inspectHref: null,
      }
    : null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("scaffoldLocation")}</p>
          {canEdit && (
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={editHref} />} className="print:hidden">
              <Pencil />
              {t("editLocation")}
            </Button>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          {projectName} · {workArea}
        </p>

        {hasLocation && marker ? (
          <>
            <div className="print:hidden">
              <ScaffoldMapView markers={[marker]} siteCenter={{ latitude, longitude }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {latitude.toFixed(6)}, {longitude.toFixed(6)}
            </p>
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={mapHref} />}>
                <MapPin />
                {t("viewOnMap")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<a href={buildDirectionsUrl({ siteLatitude: latitude, siteLongitude: longitude, siteAddress: null }) ?? "#"} target="_blank" rel="noopener noreferrer" />}
              >
                <Navigation />
                {t("directions")}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("locationNotSet")}</p>
        )}
      </CardContent>
    </Card>
  );
}
