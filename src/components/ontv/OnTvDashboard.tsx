import 'server-only';
import { MockScheduleProvider } from '@/lib/ontv/mockProvider';
import { buildForYou, runQuery } from '@/lib/ontv/dashboard';
import { parseScheduleQuery } from '@/lib/ontv/query';
import { ProgramCard } from './ProgramCard';
import { OnTvViewBar } from './OnTvViewBar';

/**
 * On TV — For You dashboard (server component). Wide layout that uses the available
 * viewport. Personalized, immediately useful, no mandatory quiz, no Judge Verity,
 * no sports. In this phase it renders clearly-labelled development mock data via the
 * MockScheduleProvider; the production ScheduleProvider (Gracenote/TVmaze) is the
 * documented drop-in.
 */
export async function OnTvDashboard({ now, tz = 'America/New_York', query, active = 'for-you' }: { now: number; tz?: string; query?: string; active?: string }) {
  const provider = new MockScheduleProvider();
  const parsed = query && query.trim() ? parseScheduleQuery(query) : null;
  const dash = await buildForYou(provider, { now, tz });
  const results = parsed ? await runQuery(provider, parsed.query, { now, tz }) : null;

  return (
    <div className="container-wide py-5">
      <header className="mb-4">
        <h1 className="text-2xl font-black text-white sm:text-3xl">On TV</h1>
        <p className="text-sm text-slate-400">Live and upcoming, ranked for you.</p>
      </header>

      {/* Natural-language schedule search — stays within On TV. */}
      <form action="/app/on-tv" method="get" className="mb-3 flex gap-2" role="search" aria-label="Search TV listings">
        <input
          name="q" defaultValue={query ?? ''} type="search"
          placeholder="Ask… e.g. “movies tonight after 8 on my channels”"
          className="input flex-1" aria-label="Ask what's on"
        />
        <button type="submit" className="btn-primary flex-none">Search</button>
      </form>

      <OnTvViewBar active={active} />

      {/* Freshness + honest data-source + cold-start labelling. */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        {dash.usingMockData && <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-200">Development mock data</span>}
        {dash.coldStart && <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">Ranked by general quality until we learn your taste</span>}
        <span>Updated {new Date(dash.freshness.fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })}{dash.freshness.stale ? ' · may be out of date' : ''}</span>
      </div>

      {parsed ? (
        <section className="mt-5" data-testid="ontv-section">
          <h2 className="text-lg font-black text-white">Results</h2>
          <p className="mb-1 text-xs text-slate-400">
            Understood as: {[parsed.query.mediaTypes.join('/') || 'anything', parsed.query.dateScope, parsed.query.startTimeMin ? `after ${parsed.query.startTimeMin}` : null, parsed.query.networks.join(', ') || null, parsed.query.availabilityScope !== 'all' ? parsed.query.availabilityScope.replace('_', ' ') : null, parsed.query.minMatch ? `match ≥ ${parsed.query.minMatch}` : null].filter(Boolean).join(' · ')}
            {' · '}<span className="text-slate-500">sports excluded</span>
          </p>
          {parsed.clarification && (
            <p className="mb-2 rounded-lg border border-brand-400/30 bg-brand-500/10 px-3 py-2 text-xs text-brand-100">{parsed.clarification.question}</p>
          )}
          {results && results.length ? (
            <div className="ontv-rail mt-2">{results.map((it) => <ProgramCard key={it.airing.id} item={it} tz={tz} now={now} />)}</div>
          ) : (
            <EmptyState title="Nothing matched that exactly." actions={['Broaden filters', 'On now', 'Movies tonight']} />
          )}
        </section>
      ) : (
        dash.sections.map((sec) => (
          <section key={sec.key} className="mt-6" data-testid="ontv-section" aria-labelledby={`sec-${sec.key}`}>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <h2 id={`sec-${sec.key}`} className="text-lg font-black text-white">{sec.title}</h2>
                <p className="text-xs text-slate-400">{sec.subtitle}</p>
              </div>
              {sec.items.length > 0 && <a href={`/app/on-tv/${sec.key.replace('_', '-')}`} className="flex-none text-xs font-semibold text-brand-200 hover:text-white">See all →</a>}
            </div>
            {sec.items.length ? (
              <div className="ontv-rail">{sec.items.map((it) => <ProgramCard key={it.airing.id} item={it} tz={tz} now={now} />)}</div>
            ) : (
              <EmptyState title={sec.empty} actions={sec.emptyActions} />
            )}
          </section>
        ))
      )}

      <section className="mt-8">
        <a href="/app/on-tv/grid" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-white/10">
          Full Schedule — open the grid →
        </a>
      </section>
    </div>
  );
}

function EmptyState({ title, actions }: { title: string; actions: string[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-sm font-semibold text-slate-200">{title}</p>
      {actions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {actions.map((a) => <span key={a} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{a}</span>)}
        </div>
      )}
    </div>
  );
}
