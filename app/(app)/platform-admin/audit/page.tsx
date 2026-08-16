import { ScrollText } from "lucide-react";
import { requirePlatformSuperAdmin } from "@/lib/auth/session";
import { listAdminAuditEvents, searchAdminCompanies, searchPlatformAccounts } from "@/modules/platform-admin/queries";
import { AUDIT_ACTION_LABELS, type AuditAction } from "@/modules/platform-admin/types";
import { AuditFilters } from "@/modules/platform-admin/components/audit-filters";
import { AdminPagination } from "@/modules/platform-admin/components/admin-pagination";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";

const PAGE_SIZE = 50;
const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABELS);

/** Renders `changes` (audit_events.changes jsonb) as a readable key/value list rather than a raw JSON dump — per Rule "no raw ... DB errors in front of a normal user." */
function ChangesSummary({ changes }: { changes: unknown }) {
  if (!changes || typeof changes !== "object") return <span className="text-muted-foreground">—</span>;
  const entries = Object.entries(changes as Record<string, unknown>);
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {entries.map(([key, value]) => (
        <span key={key} className="text-xs">
          <span className="text-muted-foreground">{key.replace(/_/g, " ")}: </span>
          {Array.isArray(value) ? value.join(", ") : typeof value === "object" && value !== null ? JSON.stringify(value) : String(value)}
        </span>
      ))}
    </div>
  );
}

type PageProps = { searchParams: Promise<Record<string, string | undefined>> };

/** Part 2E — full audit_events browser: actor, action, entity, company, timestamp, changes — filterable, paginated (never unbounded). */
export default async function PlatformAdminAuditPage({ searchParams }: PageProps) {
  await requirePlatformSuperAdmin();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const action = AUDIT_ACTIONS.includes(params.action ?? "") ? (params.action as AuditAction) : null;
  const entityType = params.entityType?.trim() || null;
  const companyId = params.companyId || null;
  const dateFrom = params.dateFrom || null;
  const dateTo = params.dateTo || null;
  const actorQuery = params.actor?.trim() || null;

  let actorUserId: string | null = null;
  if (actorQuery) {
    const matches = await searchPlatformAccounts(actorQuery, 1);
    actorUserId = matches[0]?.id ?? null;
  }

  const [{ items, totalCount }, companies] = await Promise.all([
    listAdminAuditEvents({ actorUserId, action, entityType, companyId, dateFrom, dateTo }, page, PAGE_SIZE),
    searchAdminCompanies(null, 50),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Audit Log" description="Every recorded audit event across the platform." />

      <AuditFilters companies={companies} />
      {actorQuery && !actorUserId && <p className="text-sm text-amber-600 dark:text-amber-500">No account matches &quot;{actorQuery}&quot; — showing unfiltered-by-actor results.</p>}

      {items.length === 0 ? (
        <EmptyState icon={ScrollText} title="No audit events match these filters" />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((event) => (
            <div key={event.id} className="flex flex-col gap-2 rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{AUDIT_ACTION_LABELS[event.action]}</Badge>
                  <span className="font-medium">{event.entity_type.replace(/_/g, " ")}</span>
                  <span className="text-xs text-muted-foreground">{event.entity_id}</span>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString()}</span>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>Actor: {event.actor_full_name ?? "System"}</span>
                {event.company_name && <span>Company: {event.company_name}</span>}
              </div>
              <ChangesSummary changes={event.changes} />
            </div>
          ))}
        </div>
      )}

      <AdminPagination
        basePath="/platform-admin/audit"
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={totalCount}
        extraParams={{ actor: actorQuery ?? undefined, action: action ?? undefined, entityType: entityType ?? undefined, companyId: companyId ?? undefined, dateFrom: dateFrom ?? undefined, dateTo: dateTo ?? undefined }}
      />
    </div>
  );
}
