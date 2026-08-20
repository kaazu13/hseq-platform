"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, ChevronDown, Loader2, MapPin, Navigation } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LocationPickerMap = dynamic(() => import("@/components/shared/location-picker-map").then((m) => m.LocationPickerMap), { ssr: false });

type ScaffoldLocationPickerProps = {
  latitude: string;
  longitude: string;
  onChange: (latitude: string, longitude: string) => void;
  siteCenter?: { latitude: number; longitude: number } | null;
  latitudeError?: string;
  longitudeError?: string;
};

/**
 * Part 7 — "Select on map" / "Use current location" as the PRIMARY
 * workflow, coordinates demoted to a secondary "Advanced" disclosure.
 * Coordinates are still what's actually stored/submitted (this is a UX
 * layer over the exact same latitude/longitude fields the form already
 * has) — nothing new is added to the data model here.
 */
export function ScaffoldLocationPicker({ latitude, longitude, onChange, siteCenter, latitudeError, longitudeError }: ScaffoldLocationPickerProps) {
  const t = useTranslations("ScaffoldMap");
  const [mapOpen, setMapOpen] = useState(false);
  const [draftLat, setDraftLat] = useState<number | null>(latitude ? Number(latitude) : null);
  const [draftLng, setDraftLng] = useState<number | null>(longitude ? Number(longitude) : null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const hasLocation = latitude !== "" && longitude !== "";

  function openPicker() {
    setDraftLat(latitude ? Number(latitude) : null);
    setDraftLng(longitude ? Number(longitude) : null);
    setMapOpen(true);
  }

  function confirmPicker() {
    if (draftLat != null && draftLng != null) {
      onChange(draftLat.toFixed(6), draftLng.toFixed(6));
    }
    setMapOpen(false);
  }

  function useCurrentLocation() {
    setLocationError(null);
    if (!("geolocation" in navigator)) {
      setLocationError(t("geolocationUnsupported"));
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange(position.coords.latitude.toFixed(6), position.coords.longitude.toFixed(6));
        setIsLocating(false);
      },
      () => {
        setLocationError(t("geolocationDenied"));
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {locationError && (
        <Alert variant="destructive" role="alert">
          <AlertCircle />
          <AlertDescription>{locationError}</AlertDescription>
        </Alert>
      )}

      {hasLocation ? (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-3.5" />
            {Number(latitude).toFixed(5)}, {Number(longitude).toFixed(5)}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("locationNotSet")}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={openPicker}>
          <MapPin />
          {t("selectOnMap")}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={isLocating} onClick={useCurrentLocation}>
          {isLocating ? <Loader2 className="animate-spin" /> : <Navigation />}
          {t("useCurrentLocation")}
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setAdvancedOpen((prev) => !prev)}
        className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={advancedOpen}
      >
        <ChevronDown className={advancedOpen ? "size-3.5 rotate-180 transition-transform" : "size-3.5 transition-transform"} />
        {t("advancedCoordinates")}
      </button>
      {advancedOpen && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="latitude">{t("latitude")}</Label>
            <Input
              id="latitude"
              type="number"
              step="0.000001"
              min={-90}
              max={90}
              inputMode="decimal"
              value={latitude}
              onChange={(event) => onChange(event.target.value, longitude)}
              aria-invalid={Boolean(latitudeError)}
            />
            {latitudeError && <p className="text-sm text-destructive">{latitudeError}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="longitude">{t("longitude")}</Label>
            <Input
              id="longitude"
              type="number"
              step="0.000001"
              min={-180}
              max={180}
              inputMode="decimal"
              value={longitude}
              onChange={(event) => onChange(latitude, event.target.value)}
              aria-invalid={Boolean(longitudeError)}
            />
            {longitudeError && <p className="text-sm text-destructive">{longitudeError}</p>}
          </div>
        </div>
      )}

      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("selectOnMap")}</DialogTitle>
          </DialogHeader>
          <LocationPickerMap initialLatitude={draftLat} initialLongitude={draftLng} siteCenter={siteCenter} onPick={(lat, lng) => { setDraftLat(lat); setDraftLng(lng); }} />
          <p className="text-xs text-muted-foreground">{t("mapPickerHint")}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMapOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="button" onClick={confirmPicker} disabled={draftLat == null || draftLng == null}>
              {t("confirmLocation")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
