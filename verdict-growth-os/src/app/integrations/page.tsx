import { Badge, Card, DemoBadge, ProductTag, StatTile } from "@/app/components/ui";
import { mockBundle } from "@/lib/adapters/mock";
import { PRODUCT_LIST } from "@/lib/registry";
import { store } from "@/lib/store";
import { checkCostCeiling, utilization } from "@/lib/domain/cost";
import { Bar } from "@/app/components/ui";
import { usd, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function IntegrationsPage() {
  const adapters = [mockBundle.analytics.meta, mockBundle.github.meta, mockBundle.revenue.meta, mockBundle.social.meta];
  const jobs = store.jobs();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Data Sources & Integration Health</h1>
        <p className="text-sm text-muted">Adapter status, product registry, and scheduled-job cost ceilings · <DemoBadge /></p>
      </header>

      <Card title="Provider adapters" subtitle="Every adapter is replaceable behind a stable interface">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {adapters.map((a) => (
            <div key={a.name} className="rounded-lg border border-edge bg-panel-2 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink">{a.name}</span>
                <Badge tone={a.mode === "live" ? "good" : "warn"}>{a.mode}</Badge>
              </div>
              <div className="mt-1 text-[11px] text-muted">
                {a.mode === "mock" ? "Serving labeled demo data" : `Last synced ${a.lastSyncedAt ?? "—"}`}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Product registry" subtitle="Declared configuration — not a live health claim">
        <div className="grid gap-3 lg:grid-cols-2">
          {PRODUCT_LIST.map((p) => (
            <div key={p.id} className="rounded-lg border border-edge bg-panel-2 p-3 text-xs">
              <div className="mb-2 flex items-center justify-between">
                <ProductTag product={p.id} />
                <Badge>{titleCase(p.lifecycleStage)}</Badge>
              </div>
              <Row k="Production URL" v={p.productionUrl} />
              <Row k="Repository" v={p.repository} />
              <Row k="Deployment" v={p.deploymentProvider} />
              <Row k="Analytics" v={p.analyticsSource} />
              <Row k="Database" v={p.databaseSource} />
              <Row k="Revenue model" v={p.revenueModel} />
              <Row k="Activation event" v={p.primaryActivationEvent} />
              <Row k="Retention event" v={p.primaryRetentionEvent} />
              <div className="mt-2 border-t border-edge pt-2">
                <div className="text-[10px] uppercase tracking-wide text-muted">Goals</div>
                {p.goals.map((g) => (
                  <div key={g.id} className="mt-1">
                    <div className="flex justify-between text-ink">
                      <span>{g.metric}</span>
                      <span>{g.current} / {g.target} {g.unit}</span>
                    </div>
                    <Bar value={g.target > 0 ? g.current / g.target : 0} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Scheduled jobs" subtitle="Resumable · idempotent · cost-limited · observable">
        <div className="grid gap-3 sm:grid-cols-3">
          {jobs.map((j) => {
            const util = utilization({ spentUsd: 0, ceilingUsd: j.costCeilingUsd });
            void checkCostCeiling({ spentUsd: 0, ceilingUsd: j.costCeilingUsd }, 0);
            return (
              <StatTile key={j.id} label={j.name} value={<span className="text-base">{j.cron}</span>}
                sub={`ceiling ${usd(j.costCeilingUsd)}/day · ${j.enabled ? "enabled" : "disabled"} · util ${(util * 100).toFixed(0)}%`}
                tone={j.enabled ? "good" : "neutral"} />
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-muted">{k}</span>
      <span className="min-w-0 truncate text-right text-ink">{v}</span>
    </div>
  );
}
