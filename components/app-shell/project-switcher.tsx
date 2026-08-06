"use client";

import { useTransition } from "react";
import { FolderKanban, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { setActiveProject } from "@/modules/projects/actions";
import type { Project } from "@/modules/projects/types";

type ProjectSwitcherProps = {
  companyId: string;
  projects: Project[];
  currentProjectId: string | null;
};

/**
 * Project switcher — the project-level sibling of CompanySwitcher
 * (components/app-shell/company-switcher.tsx), same shape and the same
 * "invisible for the common single-option case" convention
 * (docs/UI_GUIDELINES.md §4). Renders nothing at all when there are zero
 * accessible projects in the active company — the caller (AppSidebar) is
 * responsible for deciding what to show instead (a "choose a project"
 * prompt lives on the dashboard, not the sidebar chrome, mirroring how
 * the zero-company case works today).
 */
export function ProjectSwitcher({ companyId, projects, currentProjectId }: ProjectSwitcherProps) {
  const [isPending, startTransition] = useTransition();

  if (projects.length === 0) {
    return null;
  }

  const current = projects.find((project) => project.id === currentProjectId) ?? projects[0];

  if (projects.length === 1) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium">
            <FolderKanban className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{current.name}</span>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  function handleSelect(projectId: string, name: string) {
    if (projectId === current.id) return;
    startTransition(async () => {
      const result = await setActiveProject(companyId, projectId);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`Switched to ${name}`);
    });
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="sm"
                disabled={isPending}
                className="data-[state=open]:bg-sidebar-accent"
              />
            }
          >
            <FolderKanban className="size-4" />
            <span className="truncate font-medium">{current.name}</span>
            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Projects
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {projects.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => handleSelect(project.id, project.name)}
                  className="justify-between"
                >
                  <span className="truncate">{project.name}</span>
                  {project.id === current.id ? <Check className="size-4" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
