"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateProjectSiteLocation } from "@/modules/projects/actions";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type ProjectSiteLocationFormProps = {
  companyId: string;
  projectId: string;
  siteAddress: string | null;
  siteLatitude: number | null;
  siteLongitude: number | null;
  /** Task 3 Part 13 — platform_super_admin/company_admin/planner only; everyone else who reaches the Edit Project page still sees this section, just as read-only text. */
  canEdit: boolean;
};

/** Site address + GPS coordinates — Task 3 Part 13, feeding Part 14's "Directions" link. A separate section/save from both the general project-fields form and Part 12's country/timezone section. */
export function ProjectSiteLocationForm({ companyId, projectId, siteAddress, siteLatitude, siteLongitude, canEdit }: ProjectSiteLocationFormProps) {
  const [isPending, startTransition] = useTransition();
  const [address, setAddress] = useState(siteAddress ?? "");
  const [lat, setLat] = useState(siteLatitude !== null ? String(siteLatitude) : "");
  const [lng, setLng] = useState(siteLongitude !== null ? String(siteLongitude) : "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleSave() {
    setFieldErrors({});
    startTransition(async () => {
      const result = await updateProjectSiteLocation(companyId, projectId, {
        siteAddress: address,
        siteLatitude: lat.trim() === "" ? undefined : Number(lat),
        siteLongitude: lng.trim() === "" ? undefined : Number(lng),
      });
      if (!result.ok) {
        toast.error(result.error.message);
        setFieldErrors(result.error.fieldErrors ?? {});
        return;
      }
      toast.success("Site location updated.");
    });
  }

  if (!canEdit) {
    return (
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Site address</p>
          <p className="text-sm">{siteAddress ?? "Not set"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Coordinates</p>
          <p className="text-sm">{siteLatitude !== null && siteLongitude !== null ? `${siteLatitude}, ${siteLongitude}` : "Not set"}</p>
        </div>
        <p className="text-xs text-muted-foreground">Only a Company Admin, Planner, or Platform Super Admin can change this.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="site-address">Site address</Label>
        <Textarea id="site-address" value={address} onChange={(event) => setAddress(event.target.value)} rows={2} maxLength={500} aria-invalid={Boolean(fieldErrors.siteAddress)} />
        {fieldErrors.siteAddress && <p className="text-sm text-destructive">{fieldErrors.siteAddress}</p>}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="site-lat">Latitude</Label>
          <Input id="site-lat" type="number" step="any" min={-90} max={90} value={lat} onChange={(event) => setLat(event.target.value)} aria-invalid={Boolean(fieldErrors.siteLatitude)} placeholder="e.g. 40.7128" />
          {fieldErrors.siteLatitude && <p className="text-sm text-destructive">{fieldErrors.siteLatitude}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="site-lng">Longitude</Label>
          <Input id="site-lng" type="number" step="any" min={-180} max={180} value={lng} onChange={(event) => setLng(event.target.value)} aria-invalid={Boolean(fieldErrors.siteLongitude)} placeholder="e.g. -74.0060" />
          {fieldErrors.siteLongitude && <p className="text-sm text-destructive">{fieldErrors.siteLongitude}</p>}
        </div>
      </div>
      <div>
        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={handleSave}>
          {isPending ? <Loader2 className="animate-spin" /> : null}
          {isPending ? "Saving…" : "Save site location"}
        </Button>
      </div>
    </div>
  );
}
