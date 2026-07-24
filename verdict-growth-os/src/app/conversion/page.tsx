import { Badge, Bar, Card, DemoBadge, Empty, ProductTag, StatTile } from "@/app/components/ui";
import { aggregateCounts, biggestLeak, overallConversion, stepConversions } from "@/lib/domain/funnel";
import { readProductFilter } from "@/lib/productFilter";
import { mockAnalytics } from "@/lib/adapters/mock";
import { store } from "@/lib/store";
import { PRODUCT_LIST } from "@/lib/registry";
import { pct, num, titleCase } from "@/lib/format";
import type { ProductId } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ConversionPage({ searchParams }: { searchParams: { p?: string } }) {
  const filter = readProductFilter(searchParams);
  const products: ProductId[] = filter === "all" ? PRODUCT_LIST.map((p) => p.id) : [filter];

  const funnels = await Promise.all(
    products.map(async (product) => {
      const days = await mockAnalytics.getFunnelDays(product, 7);
      const totals = aggregateCounts(days);
      return { product, totals, convs: stepConversions(totals), leak: biggestLeak(totals), overall: overallConversion(totals) };
    }),
  );

  const experiments = store.experiments().filter((e) => filter === "all" || e.product === filter);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Conversion Laboratory</h1>
        <p className="text-sm text-muted">
          Impression → subscription funnel, drop-off analysis, and live experiments (7-day window) · <DemoBadge />
        </p>
      </header>

      {funnels.map((f) => (
        <Card key={f.product} title={<span className="flex items-center gap-2"><ProductTag product={f.product} /> funnel</span>}
          subtitle={`Overall impression→subscription: ${pct(f.overall, 2)}`}>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <StatTile label="Overall conversion" value={pct(f.overall, 2)} />
            <StatTile
              label="Biggest leak"
              value={f.leak ? `${titleCase(f.leak.from)} → ${titleCase(f.leak.to)}` : "—"}
              sub={f.leak ? `${pct(f.leak.dropOff, 0)} drop-off · ${num(f.leak.fromCount - f.leak.toCount)} users lost` : ""}
              tone="bad"
            />
            <StatTile label="Top of funnel (7d)" value={num(f.totals.impression)} sub="impressions" />
          </div>
          <div className="space-y-1.5">
            {f.convs.map((c) => {
              const isLeak = f.leak && c.from === f.leak.from;
              return (
                <div key={c.from} className="flex items-center gap-3 text-xs">
                  <div className="w-56 shrink-0 text-muted">
                    {titleCase(c.from)} → {titleCase(c.to)}
                  </div>
                  <div className="flex-1"><Bar value={c.rate} tone={isLeak ? "bad" : "brand"} /></div>
                  <div className="w-28 shrink-0 text-right text-ink">
                    {pct(c.rate, 0)} <span className="text-muted">({num(c.toCount)})</span>
                  </div>
                  {isLeak && <Badge tone="bad">leak</Badge>}
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      <Card title="Experiments" subtitle="Hypothesis-driven tests with guardrail metrics">
        {experiments.length === 0 ? <Empty>No experiments in this scope.</Empty> : (
          <div className="space-y-3">
            {experiments.map((e) => (
              <div key={e.id} className="rounded-lg border border-edge bg-panel-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ProductTag product={e.product} />
                    <Badge tone={e.status === "running" ? "good" : "neutral"}>{titleCase(e.status)}</Badge>
                    <Badge>step: {titleCase(e.funnelStep)}</Badge>
                  </div>
                  <span className="text-[11px] text-muted">guardrail: {e.guardrailMetric}</span>
                </div>
                <p className="mt-2 text-sm text-ink">{e.hypothesis}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {e.variants.map((v) => {
                    const cr = v.exposures > 0 ? v.conversions / v.exposures : 0;
                    return (
                      <div key={v.key} className="rounded-md border border-edge bg-panel px-3 py-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-ink">{v.label}</span>
                          <span className="text-muted">{pct(cr, 1)} CR</span>
                        </div>
                        <div className="mt-1"><Bar value={cr} /></div>
                        <div className="mt-1 text-[10px] text-muted">{num(v.conversions)} / {num(v.exposures)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
