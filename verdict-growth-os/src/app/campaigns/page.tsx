import { Badge, Card, DemoBadge, Empty, ProductTag } from "@/app/components/ui";
import { applyProductFilter, readProductFilter } from "@/lib/productFilter";
import { store } from "@/lib/store";
import { usd, titleCase } from "@/lib/format";
import type { Campaign, CampaignStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<CampaignStatus, "neutral" | "good" | "warn" | "bad" | "brand"> = {
  draft: "neutral",
  in_review: "warn",
  approved: "good",
  rejected: "bad",
  revision: "warn",
  archived: "neutral",
};

export default function CampaignsPage({ searchParams }: { searchParams: { p?: string } }) {
  const filter = readProductFilter(searchParams);
  const campaigns = applyProductFilter(store.campaigns(), filter);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Campaign Factory</h1>
        <p className="text-sm text-muted">
          Draft → review → approve → revise → archive. <strong>No auto-publishing in v1</strong> · <DemoBadge />
        </p>
      </header>

      {campaigns.length === 0 ? (
        <Card><Empty>No campaigns in this scope.</Empty></Card>
      ) : (
        campaigns.map((c) => <CampaignCard key={c.id} c={c} />)
      )}
    </div>
  );
}

function CampaignCard({ c }: { c: Campaign }) {
  return (
    <Card
      title={<span className="flex items-center gap-2"><ProductTag product={c.product} /> {c.objective}</span>}
      subtitle={`${c.channel} · budget ${usd(c.budgetUsd)} · ${c.trackingId}`}
      right={<Badge tone={STATUS_TONE[c.status]}>{titleCase(c.status)}</Badge>}
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <Asset label="Audience">{c.audience}</Asset>
        <Asset label="Problem">{c.problemStatement}</Asset>
        <Asset label="Positioning">{c.positioning}</Asset>
        <Asset label="Offer">{c.offer}</Asset>
        <Asset label="Creative concept">{c.creativeConcept}</Asset>
        <Asset label="Hook">{c.hook}</Asset>
        <Asset label="Script">{c.script}</Asset>
        <Asset label="Caption">{c.caption}</Asset>
        <Asset label="Thumbnail text">{c.thumbnailText}</Asset>
        <Asset label="Landing copy">{c.landingCopy}</Asset>
        <Asset label="Email copy">{c.emailCopy}</Asset>
        <Asset label="PR pitch">{c.prPitch}</Asset>
        <Asset label="Creator outreach">{c.creatorOutreach}</Asset>
        <Asset label="Reddit response">{c.redditResponse}</Asset>
      </div>
      {c.variants.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {c.variants.map((v, i) => <Badge key={i} tone="brand">Variant {i + 1}: {v}</Badge>)}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-edge pt-2 text-[11px] text-muted">
        <span>Approval: {titleCase(c.approvalState)}</span>
        <span>Publishing is disabled in v1 — approved campaigns are executed manually.</span>
      </div>
    </Card>
  );
}

function Asset({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-edge bg-panel-2 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-xs text-ink">{children}</div>
    </div>
  );
}
