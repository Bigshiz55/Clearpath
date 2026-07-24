import { Badge, Card, DemoBadge, Empty, ProductTag } from "@/app/components/ui";
import { rankOpportunities } from "@/lib/domain/scoring";
import { applyProductFilter, readProductFilter } from "@/lib/productFilter";
import { store } from "@/lib/store";
import { compact, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function OpportunitiesPage({ searchParams }: { searchParams: { p?: string } }) {
  const filter = readProductFilter(searchParams);
  const ranked = rankOpportunities(applyProductFilter(store.opportunities(), filter));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Growth Opportunity Inbox</h1>
        <p className="text-sm text-muted">
          Normalized signals from every channel, ranked on one comparable 0–100 impact axis · <DemoBadge />
        </p>
      </header>

      {ranked.length === 0 ? (
        <Card><Empty>No opportunities in this scope.</Empty></Card>
      ) : (
        <div className="space-y-3">
          {ranked.map((o) => (
            <Card key={o.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="brand">{titleCase(o.type)}</Badge>
                    <ProductTag product={o.product} />
                    <Badge tone={o.intent === "high" ? "good" : o.intent === "medium" ? "warn" : "neutral"}>
                      {o.intent} intent
                    </Badge>
                    <ApprovalBadge state={o.approvalState} />
                  </div>
                  <h2 className="mt-2 text-sm font-medium text-ink">{o.title}</h2>
                  <p className="mt-1 text-xs text-muted">
                    Audience: {o.audience} · Channel: {o.recommendedChannel}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-2xl font-semibold text-ink">{o.score}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted">impact score</div>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Suggested response">{o.suggestedResponse}</Field>
                <Field label="Expected outcome">{o.expectedOutcome}</Field>
                <Field label="Reach / competition">
                  {compact(o.estimatedReach)} reach · density {o.competitiveDensity.toFixed(2)}
                </Field>
                <Field label="Effort / risk / confidence">
                  {o.effort.toUpperCase()} · {o.risk} risk · {(o.confidence * 100).toFixed(0)}%
                </Field>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-edge pt-2 text-[11px] text-muted">
                <span>
                  Source: {o.provenance.source}
                  {o.provenance.sourceUrl ? ` · ${o.provenance.sourceUrl}` : ""} · discovered {o.discoveredAt.slice(0, 10)}
                </span>
                <span>{o.outcome ? `Outcome: ${o.outcome}` : "Outcome: pending execution"}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-edge bg-panel-2 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-xs text-ink">{children}</div>
    </div>
  );
}

function ApprovalBadge({ state }: { state: string }) {
  const tone = state === "approved" ? "good" : state === "pending" ? "warn" : state === "rejected" ? "bad" : "neutral";
  return <Badge tone={tone as "good" | "warn" | "bad" | "neutral"}>{titleCase(state)}</Badge>;
}
