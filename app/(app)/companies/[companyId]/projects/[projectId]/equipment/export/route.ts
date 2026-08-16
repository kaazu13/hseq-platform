import { NextResponse } from "next/server";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames, isPlatformSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getProject, getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { canManageEquipment } from "@/modules/equipment/permissions";
import { getEquipmentItem } from "@/modules/equipment/queries";
import { buildEquipmentInventoryWorkbook, buildEquipmentIssuedWorkbook, buildEquipmentRequestsWorkbook, buildEquipmentHistoryWorkbook, sanitizeEquipmentExcelFilename } from "@/modules/equipment/export";

type RouteContext = { params: Promise<{ companyId: string; projectId: string }> };

/**
 * Item 17 — Equipment Excel exports. `?type=inventory|issued|requests|history`
 * (defaults to inventory); `history` additionally requires `?itemId=`.
 * Same auth chain as every other canonical route/export in this tree —
 * manage-tier only (matches the page's own gate), never a broader "anyone
 * who can view" export grant, since these exports can include every
 * employee's issue history.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const { companyId, projectId } = await params;
  const { user } = await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const project = await getProject(companyId, projectId);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [roleNames, myProjectAssignmentRoles, isSuperAdmin] = await Promise.all([
    getUserRoleNames(companyId),
    getMyProjectAssignmentRoles(companyId, projectId, user.id),
    isPlatformSuperAdmin(),
  ]);
  if (!isSuperAdmin && !canManageEquipment(roleNames, projectId, myProjectAssignmentRoles)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "inventory";

  const supabase = await createClient();
  const [{ data: company }, { data: exporterProfile }] = await Promise.all([
    supabase.from("companies").select("name").eq("id", companyId).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  const companyName = company?.name ?? "Company";
  const exportedBy = exporterProfile?.full_name ?? undefined;

  let buffer: Awaited<ReturnType<typeof buildEquipmentInventoryWorkbook>>;
  let filenameSuffix: string;

  if (type === "issued") {
    buffer = await buildEquipmentIssuedWorkbook(companyId, projectId, companyName, project.name, exportedBy);
    filenameSuffix = "Issued Equipment";
  } else if (type === "requests") {
    buffer = await buildEquipmentRequestsWorkbook(companyId, projectId, companyName, project.name, exportedBy);
    filenameSuffix = "Equipment Requests";
  } else if (type === "history") {
    const itemId = url.searchParams.get("itemId");
    if (!itemId) {
      return NextResponse.json({ error: "itemId is required for a history export" }, { status: 400 });
    }
    const item = await getEquipmentItem(companyId, itemId);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    buffer = await buildEquipmentHistoryWorkbook(companyId, itemId, item.name, companyName, project.name, exportedBy);
    filenameSuffix = `Equipment History - ${item.name}`;
  } else {
    buffer = await buildEquipmentInventoryWorkbook(companyId, projectId, companyName, project.name, exportedBy);
    filenameSuffix = "Equipment Inventory";
  }

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${sanitizeEquipmentExcelFilename(`${project.name} - ${filenameSuffix} - ${new Date().toISOString().slice(0, 10)}`)}"`,
    },
  });
}
