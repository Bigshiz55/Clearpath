import { Badge, Card, DemoBadge, Empty, ProductTag, StatTile } from "@/app/components/ui";
import { arrConsistent, revenueHealth } from "@/lib/domain/revenue";
import { checkCostCeiling, utilization } from "@/lib/domain/cost";
import { Bar } from "@/app/components/ui";
import { readProductFilter } from "@/lib/productFilter";
import { mockRevenue } from "@/lib/adapters/mock";
import { getProduct, PRODUCT_LIST } from "@/lib/registry";
import { usd, pct, num } from "@/lib/format";
import type { ProductId } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RevenuePage({ searchParams }: { searchParams: { p?: string } }) {
  const filter = readProductFilter(searchParams);
  const products: ProductId[] = filter === "all" ? PRODUCT_LIST.map((p) => p.id) : [filter];

  const rows = await Promise.all(
    products.map(async (product) => {
      const rev = await mockRevenue.getRevenueSnapshot(product);
      const cost = await mockRevenue.getCostSnapshot(product);
      const health = revenueHealth(rev, cost);
      const ceiling = getProduct(product)?.costLimits.dailyLlmUsdCeiling ?? 5;
      const llmBudget = checkCostCeiling({ spentUsd: cost.llmCostUsd, ceilingUsd: ceiling }, 0);
      return { product, rev, cost, health, ceiling, llmUtil: utilization({ spentUsd: cost.llmCostUsd, ceilingUsd: ceiling }), llmBudget };
    }),
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Revenue Engine</h1>
        <p className="text-sm text-muted">
          MRR/ARR, unit economics, and AI+infra cost per active user (mock billing adapter) · <DemoBadge />
        </p>
      </header>

      {rows.map((r) => (
        <Card key={r.product} title={<span className="flex items-center gap-2"><ProductTag product={r.product} /> revenue & unit economics</span>}
          right={<Badge tone={r.health.healthy ? "good" : "warn"}>{r.health.healthy ? "healthy" : "watch"}</Badge>}>
          {r.rev.mrrUsd === 0 && r.rev.activeSubscriptions === 0 ? (
            <Empty>Pre-revenue — no subscriptions yet. Waitlist-stage product.</Empty>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile label="MRR" value={usd(r.health.mrrUsd)} sub={`ARR ${usd(r.health.arrUsd)}`} />
                <StatTile label="LTV : CAC" value={`${Number.isFinite(r.health.ltvToCac) ? r.health.ltvToCac : "∞"}×`}
                  tone={r.health.ltvToCac >= 3 ? "good" : "warn"} sub={`payback ${r.health.paybackMonths ?? "—"} mo`} />
                <StatTile label="Cost / active user" value={usd(r.health.costPerActiveUserUsd)}
                  sub={`contribution ${usd(r.health.contributionPerActiveUserUsd)}`}
                  tone={r.health.contributionPerActiveUserUsd > 0 ? "good" : "bad"} />
                <StatTile label="Churn" value={pct(r.rev.churnPct, 1)} tone={r.rev.churnPct > 0.06 ? "bad" : "good"}
                  sub={`${num(r.rev.activeSubscriptions)} subs · ${num(r.rev.trials)} trials`} />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Mini label="Trial conversion" value={pct(r.rev.trialConversionPct, 0)} />
                <Mini label="Free → paid" value={pct(r.rev.freeToPaidPct, 1)} />
                <Mini label="Rev / active user" value={usd(r.rev.revenuePerActiveUserUsd)} />
              </div>

              {!arrConsistent(r.rev) && (
                <p className="mt-3 text-xs text-bad">⚠ ARR does not equal MRR×12 — snapshot inconsistency flagged.</p>
              )}
            </>
          )}

          {/* Cost ceiling bar — always shown */}
          <div className="mt-4 rounded-lg border border-edge bg-panel-2 p-3">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted">Daily LLM spend vs ceiling</span>
              <span className="text-ink">{usd(r.cost.llmCostUsd)} / {usd(r.ceiling)}</span>
            </div>
            <Bar value={r.llmUtil} tone={r.llmUtil >= 0.8 ? "bad" : r.llmUtil >= 0.5 ? "warn" : "good"} />
            <div className="mt-1 text-[11px] text-muted">
              Infra {usd(r.cost.infraCostUsd)} · {num(r.cost.activeUsers)} active users · headroom {usd(Math.max(0, r.ceiling - r.cost.llmCostUsd))}
            </div>
          </div>
        </Card>
      ))}

      {rows.length === 0 && <Card><Empty>No revenue data in this scope.</Empty></Card>}

      <p className="text-[11px] text-muted">
        Billing is a <strong>mock Stripe-style adapter</strong>. No financial service is connected. Connecting real
        billing requires credentials and explicit approval (see docs/COST_CONTROL.md).
      </p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-edge bg-panel-2 px-3 py-2 text-xs">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-ink">{value}</div>
    </div>
  );
}
