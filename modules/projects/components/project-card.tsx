import Link from "next/link";
import { Calendar, MapPin } from "lucide-react";
import type { Project } from "@/modules/projects/types";
import { ProjectStatusBadge } from "@/modules/projects/components/project-status-badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * The projects list's card — per this milestone's "avoid a plain CRUD table
 * where a richer interface fits better." Links to the project detail page;
 * uses the project's raw `id` in the URL (unlike employees'
 * `employee_number`) because `code` is optional here and not every project
 * has one — see docs/DATABASE_SCHEMA.md's Projects section for why.
 */
export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link href={`/projects/${project.id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
      <Card className="gap-0 py-0 transition-shadow hover:shadow-md">
        <CardHeader className="gap-2 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">{project.name}</span>
              {project.client_name ? <span className="text-sm text-muted-foreground">{project.client_name}</span> : null}
            </div>
            <ProjectStatusBadge status={project.status} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 p-4 pt-0 text-sm text-muted-foreground">
          {project.code ? <span className="font-mono text-xs">{project.code}</span> : null}
          {project.location ? (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5 shrink-0" />
              {project.location}
            </span>
          ) : null}
          {(project.start_date || project.end_date) && (
            <span className="flex items-center gap-1.5">
              <Calendar className="size-3.5 shrink-0" />
              {formatDate(project.start_date)} – {formatDate(project.end_date)}
            </span>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
