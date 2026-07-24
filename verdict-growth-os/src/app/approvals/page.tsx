import { Badge, Card, DemoBadge, Empty, ProductTag } from "@/app/components/ui";
import { applyProductFilter, readProductFilter } from "@/lib/productFilter";
import { store } from "@/lib/store";
import { usd, titleCase } from "@/lib/format";
import { decideApprovalAction } from "./actions";
import type { ApprovalRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function ApprovalsPage({ searchParams }: { searchParams: { p?: string } }) {
  const filter = readProductFilter(searchParams);
  const all = applyProductFilter(store.approvals(), filter);
  const pending = all.filter((a) => a.decision === "pending");
  const decided = all.filter((a) => a.decision !== "pending");

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Approval Center</h1>
          <p className="text-sm text-muted">
            One queue for every externally-visible or financial action. Nothing executes without a human decision · <DemoBadge />
          </p>
        </div>
        <Badge tone={pending.length ? "warn" : "good"}>{pending.length} awaiting decision</Badge>
      </header>

      <Card title="Awaiting decision">
        {pending.length === 0 ? <Empty>Queue is clear.</Empty> : (
          <div className="space-y-3">
            {pending.map((a) => <ApprovalCard key={a.id} a={a} decidable />)}
          </div>
        )}
      </Card>

      <Card title="Recently decided" subtitle="Approvals only record the decision; execution is a separate audited step">
        {decided.length === 0 ? <Empty>Nothing decided yet.</Empty> : (
          <div className="space-y-3">
            {decided.map((a) => <ApprovalCard key={a.id} a={a} />)}
          </div>
        )}
      </Card>
    </div>
  );
}

function ApprovalCard({ a, decidable = false }: { a: ApprovalRequest; decidable?: boolean }) {
  const tone = a.decision === "approved" ? "good" : a.decision === "rejected" ? "bad" : a.decision === "pending" ? "warn" : "neutral";
  return (
    <div className="rounded-lg border border-edge bg-panel-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">{titleCase(a.actionType)}</Badge>
            <ProductTag product={a.product} />
            <Badge tone={tone as "good" | "bad" | "warn" | "neutral"}>{titleCase(a.decision)}</Badge>
          </div>
          <h3 className="mt-2 text-sm font-medium text-ink">{a.proposedAction}</h3>
        </div>
        <div className="shrink-0 text-right text-xs">
          <div className="text-muted">cost</div>
          <div className="text-ink">{a.costUsd > 0 ? usd(a.costUsd) : "no spend"}</div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <Meta label="Expected impact">{a.expectedImpact}</Meta>
        <Meta label="Risk">{titleCase(a.risk)}</Meta>
        <Meta label="Reversibility">{titleCase(a.reversibility)}</Meta>
        <Meta label="Approver">{a.requestedApprover}</Meta>
      </div>

      {a.evidence.length > 0 && (
        <div className="mt-3 text-xs">
          <div className="text-[10px] uppercase tracking-wide text-muted">Evidence</div>
          <ul className="mt-1 list-inside list-disc text-ink">
            {a.evidence.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {a.generatedContent && (
        <div className="mt-3 rounded-md border border-edge bg-panel px-3 py-2 text-xs">
          <div className="text-[10px] uppercase tracking-wide text-muted">Generated content (draft — not sent)</div>
          <p className="mt-1 italic text-ink">“{a.generatedContent}”</p>
        </div>
      )}

      {a.decisionReason && (
        <p className="mt-3 text-xs text-muted">Decision reason: <span className="text-ink">{a.decisionReason}</span></p>
      )}

      {decidable && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <form action={decideApprovalAction} className="flex flex-1 flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={a.id} />
            <input
              name="reason"
              placeholder="Optional decision note…"
              className="min-w-[180px] flex-1 rounded-md border border-edge bg-panel px-2 py-1.5 text-xs text-ink placeholder:text-muted focus:border-brand focus:outline-none"
            />
            <button
              type="submit" name="decision" value="approved"
              className="rounded-md border border-good/40 bg-good/10 px-3 py-1.5 text-xs font-medium text-good hover:bg-good/20"
            >
              Approve
            </button>
            <button
              type="submit" name="decision" value="rejected"
              className="rounded-md border border-bad/40 bg-bad/10 px-3 py-1.5 text-xs font-medium text-bad hover:bg-bad/20"
            >
              Reject
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-edge bg-panel px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-ink">{children}</div>
    </div>
  );
}
