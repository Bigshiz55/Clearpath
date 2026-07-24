import { Badge, Card, DemoBadge, Empty, ProductTag } from "@/app/components/ui";
import { store } from "@/lib/store";
import { applyProductFilter, readProductFilter } from "@/lib/productFilter";

export const dynamic = "force-dynamic";

export default function AuditPage({ searchParams }: { searchParams: { p?: string } }) {
  const filter = readProductFilter(searchParams);
  const events = applyProductFilter(store.audit(), filter);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Audit Log</h1>
        <p className="text-sm text-muted">
          Every automated action and human decision creates an immutable record here · <DemoBadge />
        </p>
      </header>

      <Card>
        {events.length === 0 ? <Empty>No audit events in this scope.</Empty> : (
          <ol className="divide-y divide-edge">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-mono text-xs text-brand">{e.action}</span>
                  <span className="text-muted"> · {e.entityType}:{e.entityId}</span>
                  {Object.keys(e.metadata).length > 0 && (
                    <div className="text-[11px] text-muted">
                      {Object.entries(e.metadata).map(([k, v]) => `${k}=${String(v)}`).join(" · ")}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted">
                  <ProductTag product={e.product} />
                  <Badge>{e.actor}</Badge>
                  <span className="font-mono">{e.at.replace("T", " ").slice(0, 16)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
