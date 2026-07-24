import { Badge, Bar, Card, DemoBadge, Empty, ProductTag, StatTile } from "@/app/components/ui";
import { buildBriefing } from "@/lib/domain/briefing";
import { explainOpportunityScore } from "@/lib/domain/scoring";
import { DEMO_NOW } from "@/lib/now";
import { applyProductFilter, readProductFilter } from "@/lib/productFilter";
import { store } from "@/lib/store";
import { relDeadline, titleCase } from "@/lib/format";
import type { Recommendation } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function BriefingPage({ searchParams }: { searchParams: { p?: string } }) {
  const filter = readProductFilter(searchParams);

  const briefing = buildBriefing({
    now: DEMO_NOW,
    observations: applyProductFilter(store.observations(), filter),
    opportunities: applyProductFilter(store.opportunities(), filter),
    recommendations: applyProductFilter(store.recommendations(), filter),
    incidents: applyProductFilter(store.incidents(), filter),
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Executive Briefing</h1>
          <p className="text-sm text-muted">
            Since the last briefing · generated {briefing.generatedAt.slice(0, 10)} · <DemoBadge />
          </p>
        </div>
        <div className="flex gap-2">
          <Badge tone="good">{briefing.grew.length} grew</Badge>
          <Badge tone="bad">{briefing.declined.length} declined</Badge>
          <Badge tone="warn">{briefing.broken.length} broken</Badge>
        </div>
      </header>

      {/* Top 5 actions — the primary decision surface */}
      <Card
        title="The 5 highest-value actions today"
        subtitle="Ranked by expected business impact × confidence, boosted by urgency"
      >
        {briefing.topActions.length === 0 ? (
          <Empty>No open recommendations for this scope.</Empty>
        ) : (
          <ol className="space-y-3">
            {briefing.topActions.map((r, i) => (
              <ActionRow key={r.id} rank={i + 1} r={r} />
            ))}
          </ol>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="What grew" subtitle="Positive movements worth reinforcing">
          {briefing.grew.length === 0 ? <Empty>Nothing notable.</Empty> : (
            <ul className="space-y-2">
              {briefing.grew.map((o) => (
                <li key={o.id} className="flex items-start justify-between gap-3 text-sm">
                  <div>
                    <div className="text-ink">{o.summary}</div>
                    <div className="text-xs text-muted">{o.metric}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <ProductTag product={o.product} />
                    {o.changePct != null && <Badge tone="good">▲ {o.changePct}%</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="What declined / threatens revenue" subtitle="Negative movements, revenue risks first">
          {briefing.declined.length === 0 ? <Empty>Nothing declining.</Empty> : (
            <ul className="space-y-2">
              {briefing.declined.map((o) => {
                const isThreat = briefing.revenueThreats.some((t) => t.id === o.id);
                return (
                  <li key={o.id} className="flex items-start justify-between gap-3 text-sm">
                    <div>
                      <div className="text-ink">{o.summary}</div>
                      <div className="text-xs text-muted">{o.metric}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {isThreat && <Badge tone="bad">revenue risk</Badge>}
                      <ProductTag product={o.product} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="What is broken" subtitle="Open incidents, most severe first">
          {briefing.broken.length === 0 ? <Empty>No open incidents. 🎉</Empty> : (
            <ul className="space-y-2">
              {briefing.broken.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 text-sm">
                  <div>
                    <div className="text-ink">{i.title}</div>
                    <div className="text-xs text-muted">{i.summary}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={i.severity === "sev1" ? "bad" : "warn"}>{i.severity}</Badge>
                    <Badge>{i.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Opportunities that appeared" subtitle="Top-scored, ranked on one comparable axis">
          {briefing.newOpportunities.length === 0 ? <Empty>No new opportunities.</Empty> : (
            <ul className="space-y-2">
              {briefing.newOpportunities.map((o) => (
                <li key={o.id} className="text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-ink">{o.title}</div>
                    <div className="flex shrink-0 items-center gap-2">
                      <ProductTag product={o.product} />
                      <StatScore value={o.score ?? 0} />
                    </div>
                  </div>
                  <div className="text-xs text-muted">{explainOpportunityScore(o)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function ActionRow({ rank, r }: { rank: number; r: Recommendation & { priorityScore: number } }) {
  return (
    <li className="rounded-lg border border-edge bg-panel-2 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand/20 text-sm font-semibold text-brand">
            {rank}
          </div>
          <div>
            <div className="text-sm font-medium text-ink">{r.recommendedAction}</div>
            <div className="mt-0.5 text-xs text-muted">{r.problem}</div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <ProductTag product={r.product} />
          <StatScore value={r.priorityScore} label="priority" />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <Badge tone="brand">{titleCase(r.department)}</Badge>
        <Badge>impact {r.expectedImpact}</Badge>
        <Badge>conf {(r.confidence * 100).toFixed(0)}%</Badge>
        <Badge>effort {r.effort.toUpperCase()}</Badge>
        <Badge tone="warn">{relDeadline(r.deadline, DEMO_NOW)}</Badge>
        {r.approvalRequired ? <Badge tone="bad">needs approval</Badge> : <Badge tone="good">auto-safe</Badge>}
        <span className="text-muted">→ moves <span className="text-ink">{r.metricAffected}</span> · owner {r.owner}</span>
      </div>
    </li>
  );
}

function StatScore({ value, label }: { value: number; label?: string }) {
  const tone = value >= 60 ? "good" : value >= 40 ? "warn" : "neutral";
  return (
    <div className="w-24">
      <div className="mb-1 flex items-center justify-between text-[10px] text-muted">
        <span>{label ?? "score"}</span>
        <span className="text-ink">{value}</span>
      </div>
      <Bar value={value / 100} tone={tone === "good" ? "good" : tone === "warn" ? "warn" : "brand"} />
    </div>
  );
}
