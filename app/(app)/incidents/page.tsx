import { ComingSoonPage } from "@/components/shared/coming-soon";
import { ALL_NAV_ITEMS } from "@/components/app-shell/nav-config";

const item = ALL_NAV_ITEMS.find((navItem) => navItem.href === "/incidents")!;

export default function IncidentsPage() {
  return <ComingSoonPage title={item.label} description={item.description} icon={item.icon} />;
}
