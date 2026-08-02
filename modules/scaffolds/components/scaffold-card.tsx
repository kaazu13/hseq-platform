import Link from "next/link";
import { MapPin, Tag } from "lucide-react";
import type { Scaffold } from "@/modules/scaffolds/types";
import { SCAFFOLD_TYPE_LABELS } from "@/modules/scaffolds/types";
import { ScaffoldStatusBadge } from "@/modules/scaffolds/components/scaffold-status-badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** Scaffold register list card — same visual shape as every other list card this session. */
export function ScaffoldCard({ scaffold, projectName, currentInspectionExpiresAt }: { scaffold: Scaffold; projectName: string; currentInspectionExpiresAt: string | null }) {
  return (
    <Link href={`/scaffolds/${scaffold.id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
      <Card className="gap-0 py-0 transition-shadow hover:shadow-md">
        <CardHeader className="gap-2 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1.5 font-semibold">
                <Tag className="size-3.5 shrink-0 text-muted-foreground" />
                {scaffold.tag_number}
              </span>
              <span className="text-sm text-muted-foreground">{projectName}</span>
            </div>
            <ScaffoldStatusBadge status={scaffold.status} currentInspectionExpiresAt={currentInspectionExpiresAt} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 p-4 pt-0 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" />
            {scaffold.work_area}
          </span>
          <span>{SCAFFOLD_TYPE_LABELS[scaffold.scaffold_type]}</span>
        </CardContent>
      </Card>
    </Link>
  );
}
