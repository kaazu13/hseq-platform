import { ComingSoonPage } from "@/components/shared/coming-soon";
import { ALL_NAV_ITEMS } from "@/components/app-shell/nav-config";

const item = ALL_NAV_ITEMS.find((navItem) => navItem.href === "/projects")!;

export default function ProjectsPage() {
  return <ComingSoonPage title={item.label} description={item.description} icon={item.icon} />;
}
