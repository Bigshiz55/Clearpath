import { Badge, Card, DemoBadge, Empty, ProductTag } from "@/app/components/ui";
import { readProductFilter } from "@/lib/productFilter";
import { mockGitHub } from "@/lib/adapters/mock";
import { store } from "@/lib/store";
import { PRODUCT_LIST } from "@/lib/registry";
import { num, titleCase } from "@/lib/format";
import type { ProductId } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EngineeringPage({ searchParams }: { searchParams: { p?: string } }) {
  const filter = readProductFilter(searchParams);
  const products: ProductId[] = filter === "all" ? PRODUCT_LIST.map((p) => p.id) : [filter];

  const data = await Promise.all(
    products.map(async (product) => ({
      product,
      prs: await mockGitHub.listPullRequests(product),
      deploys: await mockGitHub.listDeployments(product),
      incidents: await mockGitHub.listIncidents(product),
    })),
  );
  const feedback = store.feedback().filter((f) => filter === "all" || f.product === filter);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Product & Engineering Command</h1>
        <p className="text-sm text-muted">
          PRs, deployments, incidents, and customer-reported issues — via the provider-neutral GitHub adapter (mock) · <DemoBadge />
        </p>
      </header>

      {data.map((d) => (
        <div key={d.product} className="grid gap-5 lg:grid-cols-3">
          <Card title={<span className="flex items-center gap-2"><ProductTag product={d.product} /> Pull requests</span>}>
            {d.prs.length === 0 ? <Empty>None.</Empty> : (
              <ul className="space-y-2 text-sm">
                {d.prs.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-ink">#{p.number} {p.title}</span>
                    <Badge tone={p.state === "merged" ? "brand" : p.state === "open" ? "good" : "neutral"}>{p.state}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Deployments">
            {d.deploys.length === 0 ? <Empty>None.</Empty> : (
              <ul className="space-y-2 text-sm">
                {d.deploys.map((dep) => (
                  <li key={dep.id} className="flex items-center justify-between gap-2">
                    <span className="text-ink">{dep.environment} · {dep.sha}</span>
                    <Badge tone={dep.status === "success" ? "good" : dep.status === "failed" ? "bad" : "warn"}>{dep.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Incidents">
            {d.incidents.length === 0 ? <Empty>No open incidents.</Empty> : (
              <ul className="space-y-2 text-sm">
                {d.incidents.map((i) => (
                  <li key={i.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-ink">{i.title}</span>
                      <Badge tone={i.severity === "sev1" ? "bad" : "warn"}>{i.severity}</Badge>
                    </div>
                    <div className="text-xs text-muted">{i.summary}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ))}

      <Card title="Customer-reported feedback" subtitle="Bugs, feature requests, complaints and praise (mock support source)">
        {feedback.length === 0 ? <Empty>None.</Empty> : (
          <ul className="space-y-2 text-sm">
            {feedback.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3">
                <div>
                  <span className="text-ink">{f.summary}</span>
                  <div className="text-xs text-muted">{titleCase(f.kind)} · {num(f.count)} reports</div>
                </div>
                <div className="flex items-center gap-2">
                  <ProductTag product={f.product} />
                  <Badge tone={f.kind === "praise" ? "good" : f.kind === "complaint" ? "bad" : "warn"}>{titleCase(f.kind)}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-[11px] text-muted">
        Note: repository/deployment data shown here is <strong>mock</strong>. No claim is made about the real
        production state of either app until the live GitHub/Vercel adapters are connected.
      </p>
    </div>
  );
}
