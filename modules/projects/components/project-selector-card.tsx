"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setActiveProject } from "@/modules/projects/actions";
import type { Project } from "@/modules/projects/types";
import { ProjectStatusBadge } from "@/modules/projects/components/project-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * The multiple-accessible-projects branch of post-login/post-company-
 * switch resolution (app/(app)/dashboard/page.tsx) — a full-width prompt
 * rather than a header dropdown, since at this point there is genuinely no
 * active project yet for anything else on the page to be scoped to.
 * Selecting one calls the same `setActiveProject()` Server Function the
 * sidebar's ProjectSwitcher uses, then refreshes so the dashboard re-
 * renders with a resolved project.
 */
export function ProjectSelectorCard({ companyId, projects }: { companyId: string; projects: Project[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSelect(projectId: string) {
    setPendingId(projectId);
    startTransition(async () => {
      const result = await setActiveProject(companyId, projectId);
      if (!result.ok) {
        toast.error(result.error.message);
        setPendingId(null);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <Card key={project.id}>
          <CardContent className="flex flex-col gap-3 pt-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <FolderKanban className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium">{project.name}</span>
              </div>
              <ProjectStatusBadge status={project.status} />
            </div>
            <Button size="sm" disabled={isPending} onClick={() => handleSelect(project.id)}>
              {isPending && pendingId === project.id ? <Loader2 className="animate-spin" /> : null}
              Work in this project
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
