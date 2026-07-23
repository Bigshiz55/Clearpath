import { notFound } from 'next/navigation';
import { resolveEnglishAudio } from '@/lib/lang/audioAvailability';
import { curatedRecordsFor, heuristicRecord } from '@/lib/lang/audioSources';
import { AudioStatusBadge } from '@/components/AudioStatusBadge';
import { splitByAudio, type AudioRankedItem } from '@/lib/lang/audioRecommend';

/**
 * Deterministic audio-verification harness for responsive/visual tests. Renders the
 * two sections a STRICT "with English audio" request produces:
 *   1. "Verified — English audio" (primary, VERIFIED only), and
 *   2. "Possible matches — English audio not yet verified" (LIKELY / UNKNOWN),
 * using the REAL resolver + curated verified registry and the low-confidence TMDB
 * heuristic. No auth, no network. Gated behind RESPONSIVE_HARNESS=1 so it never
 * ships in normal builds.
 */
export const dynamic = 'force-dynamic';

type Card = { id: string; title: string; year: number; originalLanguage: string; provider: string; region: string };

// Real titles from the curated verified registry (Netflix / US), each an actual
// foreign-original show with a human-verified English dub.
const VERIFIED_CARDS: Card[] = [
  { id: 'tv:71446', title: 'Money Heist', year: 2017, originalLanguage: 'Spanish', provider: 'Netflix', region: 'US' },
  { id: 'tv:70523', title: 'Dark', year: 2017, originalLanguage: 'German', provider: 'Netflix', region: 'US' },
  { id: 'tv:96677', title: 'Lupin', year: 2021, originalLanguage: 'French', provider: 'Netflix', region: 'US' },
  { id: 'tv:93405', title: 'Squid Game', year: 2021, originalLanguage: 'Korean', provider: 'Netflix', region: 'US' },
];

// Titles with NO verified record for the recommended provider — the heuristic can
// only ever say LIKELY, and an unlisted title resolves to UNKNOWN. Neither is ever
// promoted into the verified list.
const POSSIBLE_CARDS: Array<Card & { heuristic: boolean }> = [
  { id: 'tv:12345', title: 'Call My Agent!', year: 2015, originalLanguage: 'French', provider: 'Prime Video', region: 'US', heuristic: true },
  { id: 'tv:67890', title: 'The Bridge', year: 2011, originalLanguage: 'Swedish', provider: 'Prime Video', region: 'US', heuristic: false },
];

function slug(name: string): string {
  return name.toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]+/g, '');
}

function verifiedItems(): AudioRankedItem<Card>[] {
  return VERIFIED_CARDS.map((c) => ({
    item: c,
    audio: resolveEnglishAudio(curatedRecordsFor(c.id, slug(c.provider), c.region), { providerId: slug(c.provider), region: c.region }),
  }));
}

function possibleItems(): AudioRankedItem<Card>[] {
  return POSSIBLE_CARDS.map((c) => {
    const providerId = slug(c.provider);
    // No curated record for these; a heuristic source yields at most LIKELY, and no
    // source at all yields UNKNOWN. Verified is impossible on this path by design.
    const records = c.heuristic
      ? [heuristicRecord({ titleId: c.id, mediaType: 'tv', providerId, providerName: c.provider, region: c.region, originalLanguage: c.originalLanguage, englishAvailability: 'available' })]
      : [];
    return { item: c, audio: resolveEnglishAudio(records, { providerId, region: c.region }) };
  });
}

function CardTile({ card, audio, unverified }: { card: Card; audio: ReturnType<typeof resolveEnglishAudio>; unverified: boolean }) {
  return (
    <article className="card rounded-xl border border-white/10 bg-white/5 p-3" data-testid="audio-card">
      <div className="flex min-w-0 gap-3">
        <div aria-hidden className="h-24 w-16 shrink-0 rounded-md bg-gradient-to-br from-slate-700 to-slate-800" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-white">{card.title} <span className="font-normal text-slate-400">({card.year})</span></h3>
          <p className="text-xs text-slate-400">{card.provider}</p>
          <AudioStatusBadge
            status={audio.status}
            originalLanguage={card.originalLanguage}
            provider={audio.providerName ?? card.provider}
            region={card.region}
            verifiedAt={audio.verifiedAt}
            unverified={unverified}
          />
        </div>
      </div>
    </article>
  );
}

export default function DevAudio() {
  if (process.env.RESPONSIVE_HARNESS !== '1') notFound();

  const verified = verifiedItems();
  const possible = possibleItems();
  const split = splitByAudio([...verified, ...possible], { strict: true, requested: 6 });

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-6">
      <header className="mb-5">
        <h1 className="text-lg font-black text-white">Foreign shows with English audio</h1>
        <p className="mt-1 text-sm text-slate-400">
          Strict request — only titles with a <strong className="text-emerald-300">verified</strong> English audio track on the recommended
          provider appear in the main list. Unverified candidates are kept separate.
        </p>
      </header>

      <section data-testid="verified-section" className="mb-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-emerald-300">Verified — English audio ({split.primary.length})</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {split.primary.map((x) => (
            <CardTile key={x.item.id} card={x.item} audio={x.audio} unverified={false} />
          ))}
        </div>
        {split.shortfall && (
          <p data-testid="shortfall" className="mt-3 text-xs text-amber-300">
            Only {split.verifiedCount} verified {split.verifiedCount === 1 ? 'match' : 'matches'} for your exact request — we don’t pad the list to hit a number.
          </p>
        )}
      </section>

      <section data-testid="possible-section">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-amber-300">{split.possibleMatchesLabel} ({split.possibleMatches.length})</h2>
        <p className="mb-3 text-xs text-slate-500">Foreign originals that may have an English dub — we couldn’t confirm one on the recommended provider yet, so they’re shown separately, never mixed into the verified list.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {split.possibleMatches.map((x) => (
            <CardTile key={x.item.id} card={x.item} audio={x.audio} unverified />
          ))}
        </div>
      </section>
    </main>
  );
}
