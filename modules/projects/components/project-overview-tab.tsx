import type { Project } from "@/modules/projects/types";
import { ProjectStatusBadge } from "@/modules/projects/components/project-status-badge";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

export function ProjectOverviewTab({ project }: { project: Project }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Client" value={project.client_name ?? "—"} />
      <Field label="Project code" value={project.code ? <span className="font-mono">{project.code}</span> : "—"} />
      <Field label="Status" value={<ProjectStatusBadge status={project.status} />} />
      <Field label="Location" value={project.location ?? "—"} />
      <Field label="Start date" value={formatDate(project.start_date)} />
      <Field label="End date" value={formatDate(project.end_date)} />
      <Field label="Created" value={formatTimestamp(project.created_at)} />
      <Field label="Last updated" value={formatTimestamp(project.updated_at)} />
      {project.description && (
        <div className="flex flex-col gap-0.5 sm:col-span-2 lg:col-span-3">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Description</span>
          <p className="text-sm whitespace-pre-wrap">{project.description}</p>
        </div>
      )}
    </div>
  );
}
