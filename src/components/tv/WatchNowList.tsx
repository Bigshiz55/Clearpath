import type { WatchNowResult, WatchNowItem } from '@/lib/tv/platform/query';
import { watchOptionFromItem } from '@/lib/tv/platform/query';
import { resolveWatchPresentation } from '@/lib/availability/watchPresentation';

/**
 * THE UNIFIED RESULT LIST.
 *
 * Streaming and linear in one list, because the user's question is "what can
 * I watch", not "which pipeline should I consult". The card says which it is
 * rather than making the reader work it out.
 *
 * IT OWNS NO AVAILABILITY VOCABULARY. Every phrase describing what an offer
 * IS comes from `resolveWatchPresentation`, the one resolver, reached through
 * `watchOptionFromItem`. The first version of this component reimplemented
 * that mapping and an architecture test rejected it — correctly, because two
 * mappings drift, and the way this one drifts is a rentable title labelled as
 * included with a subscription somebody already pays for.
 *
 * What this component DOES own is provenance: source, stage, confidence and
 * freshness are rendered on every card, because a recommendation whose origin
 * is invisible is one nobody can check.
 *
 * Server component: no client JS, no fetch on mount, no upstream request.
 */

function itemKey(item: WatchNowItem): string {
  return `${item.kind}:${item.titleKey}:${item.serviceSlug ?? item.networkSlug ?? ''}:${item.startUtc ?? ''}`;
}

export function WatchNowList({ result }: { result: WatchNowResult }) {
  if (result.status === 'configuration_error') {
    return (
      <div data-testid="watch-now-config-error" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
        <p className="font-semibold text-amber-200">Live TV listings are unavailable right now</p>
        <p className="mt-1 text-sm text-amber-100/80">We couldn’t load a verified schedule just now. Check back soon.</p>
      </div>
    );
  }

  if (result.items.length === 0) {
    return (
      <div data-testid="watch-now-empty" className="rounded-lg border border-white/10 bg-white/5 p-4">
        <p className="font-semibold">Nothing verified to show yet</p>
        <p className="mt-1 text-sm text-white/60">
          {result.message ?? 'No source has reached the verified stage for this surface.'}
        </p>
      </div>
    );
  }

  return (
    <ul data-testid="watch-now-list" className="grid gap-3">
      {result.items.map((item) => {
        // One item, one option, straight through the shared resolver.
        const presentation = resolveWatchPresentation({
          options: [watchOptionFromItem(item)],
          checked: true,
        });
        const line = presentation.lines[0] ?? null;

        return (
          <li
            key={itemKey(item)}
            data-testid="watch-now-item"
            data-kind={item.kind}
            data-fixture={item.isFixture ? '1' : '0'}
            className="min-w-0 rounded-lg border border-white/10 bg-white/5 p-3"
          >
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="min-w-0 break-words font-semibold">{item.title}</span>
              {item.year ? <span className="text-sm text-white/50">{item.year}</span> : null}
              <span
                data-testid="watch-now-kind"
                className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/70"
              >
                {item.kind === 'linear' ? 'On TV' : 'Streaming'}
              </span>
            </div>

            <div className="mt-1 min-w-0 text-sm text-white/70">
              <span data-testid="watch-now-offer" className="break-words">
                {line?.text ?? item.serviceName ?? item.serviceSlug ?? item.networkSlug}
              </span>
              {line?.detail ? (
                <span data-testid="watch-now-detail" className="ml-2 break-words text-white/50">
                  {line.detail}
                </span>
              ) : null}
            </div>

            {/* Provenance, always visible. */}
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/45">
              <span data-testid="watch-now-source">source: {item.sourceSlug}</span>
              <span aria-hidden className="text-white/20">·</span>
              <span data-testid="watch-now-stage">{item.supportStage}</span>
              {item.confidence !== null && item.confidence < 1 ? (
                <>
                  <span aria-hidden className="text-white/20">·</span>
                  <span data-testid="watch-now-confidence">match {(item.confidence * 100).toFixed(0)}%</span>
                </>
              ) : null}
              {item.lastSeenUtc ? (
                <span data-testid="watch-now-freshness" title={item.lastSeenUtc}>
                  checked {item.lastSeenUtc.slice(0, 10)}
                </span>
              ) : null}
              {item.isFixture ? (
                <span data-testid="watch-now-fixture-badge" className="rounded bg-amber-400/20 px-1.5 py-0.5 text-amber-200">
                  TEST DATA
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
