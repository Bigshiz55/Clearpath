import { notFound } from 'next/navigation';
import { ShareVerdictCard } from '@/components/court/ShareVerdictCard';
import type { ShareCardInput } from '@/lib/court/shareCard';

/**
 * Share-card harness (gated by MOBILE_HARNESS=1) — renders the real
 * `ShareVerdictCard` component with 2, 3 and 5 jurors, and with a poster URL
 * that 404s, so Playwright can exercise the canvas render, the missing-poster
 * fallback, and the Copy/Download/Share buttons without a live Court room.
 * 404s in any normal build.
 */
export const dynamic = 'force-dynamic';

const JOIN_URL = 'https://clearpath-pearl-chi.vercel.app/court/HARNESS1';
// A same-origin local asset, not a live TMDB URL — this harness must render
// deterministically without depending on outbound network (which this
// sandbox does not reliably have to image.tmdb.org from the BROWSER
// context). Same-origin also means the canvas is never cross-origin-tainted,
// so this genuinely exercises the successful-poster cover-fit draw path.
const POSTER = '/icons/icon-512.png';

function jurors(n: number) {
  const names = ['Scott', 'Amy', 'Heather', 'Marcus', 'Priya', 'Devon', 'Kai'];
  return Array.from({ length: n }, (_, i) => ({ name: names[i % names.length]!, score: 60 + ((i * 13) % 35) }));
}

const CASES: { key: string; label: string; data: ShareCardInput }[] = [
  {
    key: 'two-jurors',
    label: '2 jurors, with poster',
    data: {
      title: 'The Quiet Room',
      year: 2019,
      posterUrl: POSTER,
      groupScore: 84,
      joinUrl: JOIN_URL,
      jurors: jurors(2),
      vetoed: [{ title: 'Screamfest VII', byNames: ['Amy'] }],
    },
  },
  {
    key: 'three-jurors',
    label: '3 jurors, two vetoes',
    data: {
      title: 'A Very Long Documentary Title About Nothing In Particular',
      year: 2021,
      posterUrl: POSTER,
      groupScore: 71,
      joinUrl: JOIN_URL,
      jurors: jurors(3),
      vetoed: [
        { title: 'Screamfest VII', byNames: ['Amy'] },
        { title: 'The Endless Meeting', byNames: ['Scott', 'Heather'] },
      ],
    },
  },
  {
    key: 'five-jurors',
    label: '5 jurors, many vetoes (overflow)',
    data: {
      title: 'Second Choice',
      year: 2023,
      posterUrl: POSTER,
      groupScore: 92,
      joinUrl: JOIN_URL,
      jurors: jurors(5),
      vetoed: Array.from({ length: 6 }, (_, i) => ({ title: `Rejected Title ${i + 1}`, byNames: ['Scott'] })),
    },
  },
  {
    key: 'missing-poster',
    label: 'Missing poster art (404 — the placeholder path)',
    data: {
      title: 'Ghost Poster',
      year: null,
      // A real, fast, same-origin 404 — deterministic, no live network needed.
      posterUrl: '/icons/does-not-exist-404.png',
      groupScore: 66,
      joinUrl: JOIN_URL,
      jurors: jurors(2),
      vetoed: [],
    },
  },
  {
    key: 'no-poster-url',
    label: 'No poster URL at all',
    data: {
      title: 'Never Had A Poster',
      year: 2018,
      posterUrl: null,
      groupScore: 51,
      joinUrl: JOIN_URL,
      jurors: jurors(3),
      vetoed: [],
    },
  },
];

export default function ShareCardHarnessPage() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return (
    <div className="min-h-dvh space-y-8 bg-ink-950 p-6" data-testid="share-card-harness">
      {CASES.map((c) => (
        <div key={c.key} data-testid={`case-${c.key}`}>
          <h2 className="mb-2 text-sm font-bold text-white">{c.label}</h2>
          <ShareVerdictCard data={c.data} />
        </div>
      ))}
    </div>
  );
}
