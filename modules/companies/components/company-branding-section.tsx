"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateCompanyName, uploadCompanyLogo, removeCompanyLogo } from "@/modules/companies/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type CompanyBrandingSectionProps = {
  companyId: string;
  companyName: string;
  logoUrl: string | null;
};

/**
 * Company branding self-service (Phase 15) — name + logo, for
 * company_admin/operations_manager only (the page itself gates rendering;
 * the underlying RLS/actions are the real enforcement). The logo preview
 * is rendered inside a fixed, bounded container (object-fit: contain) so
 * an extreme aspect ratio or oversized source image can never distort the
 * surrounding layout (Phase 15's explicit "do not let a giant or oddly-
 * shaped uploaded image destroy the UI" instruction).
 */
export function CompanyBrandingSection({ companyId, companyName, logoUrl }: CompanyBrandingSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(companyName);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function saveName() {
    if (!name.trim()) {
      toast.error("Company name is required.");
      return;
    }
    startTransition(async () => {
      const result = await updateCompanyName(companyId, { name });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Company name updated.");
      router.refresh();
    });
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const result = await uploadCompanyLogo(companyId, formData);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Logo updated.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    });
  }

  function removeLogo() {
    startTransition(async () => {
      const result = await removeCompanyLogo(companyId);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Logo removed.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company branding</CardTitle>
        <CardDescription>Shown in the app header/sidebar, PDF reports, and Excel exports.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="company-name">Company name</Label>
          <div className="flex max-w-md gap-2">
            <Input id="company-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={200} />
            <Button type="button" onClick={saveName} disabled={isPending || name.trim() === companyName}>
              Save
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Logo</Label>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-40 items-center justify-center rounded-md border bg-muted/30 p-2">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local asset next/image can optimize
                <img src={logoUrl} alt={`${companyName} logo`} className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-xs text-muted-foreground">No logo set</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} className="text-sm" disabled={isPending} />
              <span className="text-xs text-muted-foreground">PNG, JPEG, or WebP — up to 5 MB.</span>
              {logoUrl && (
                <Button type="button" variant="outline" size="sm" onClick={removeLogo} disabled={isPending} className="w-fit">
                  Remove logo
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
