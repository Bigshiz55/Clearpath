import { notFound } from 'next/navigation';
import { DidWeGetItRight, GradePanel } from '@/components/verdict/DidWeGetItRight';
import { gradeCall, accuracyLine, MIN_ACCURACY_SAMPLE, type CallResult } from '@/lib/verdict/postWatch';

/**
 * "Did we get it right?" harness (gated by MOBILE_HARNESS=1). 404 in any normal
 * build.
 *
 * It renders the real component in the two states a signed-in user can be in —
 * asked, and already-answered (which must render NOTHING) — plus every grade
 * the engine can hand back. Producing those four grades from live data would
 * need four watch histories and a session; producing them from `gradeCall` uses
 * the same pure function the product does, so what Playwright sees here is what
 * a user sees there.
 */
export const dynamic = 'force-dynamic';

const SAMPLES: { key: string; predicted: number | null; reaction: Parameters<typeof gradeCall>[1] }[] = [
  { key: 'hit', predicted: 88, reaction: 'loved' },
  { key: 'partial', predicted: 60, reaction: 'loved' },
  { key: 'miss', predicted: 31, reaction: 'liked' },
  { key: 'ungraded', predicted: null, reaction: 'liked' },
];

export default function PostWatchHarnessPage() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();

  const thin: CallResult[] = ['hit', 'hit', 'miss'];
  const enough: CallResult[] = [
    ...Array.from({ length: 7 }, () => 'hit' as CallResult),
    ...Array.from({ length: 3 }, () => 'miss' as CallResult),
  ];

  return (
    <div className="mx-auto min-h-dvh max-w-2xl space-y-6 p-4 sm:p-8" data-testid="post-watch-harness">
      <div data-testid="pw-ask">
        <DidWeGetItRight
          tmdbId={603}
          mediaType="movie"
          title="The Matrix"
          year={1999}
          posterPath={null}
          predicted={88}
          existingRating={null}
        />
      </div>

      {/* DEDUPE: a rating already on record means they answered. This block must
          render nothing at all — the test asserts the container is empty. */}
      <div data-testid="pw-answered">
        <DidWeGetItRight
          tmdbId={603}
          mediaType="movie"
          title="The Matrix"
          year={1999}
          posterPath={null}
          predicted={88}
          existingRating={9}
        />
      </div>

      {SAMPLES.map((s) => (
        <div key={s.key} data-testid={`pw-grade-${s.key}`}>
          <GradePanel grade={gradeCall(s.predicted, s.reaction)} />
        </div>
      ))}

      {/* The gate: under the minimum sample there must be no percentage on
          screen at all, only progress toward one. */}
      <p data-testid="pw-acc-thin" className="text-sm text-slate-400">
        {accuracyLine(thin).text}
      </p>
      <p data-testid="pw-acc-enough" className="text-sm text-slate-300">
        {accuracyLine(enough).text}
      </p>
      <p data-testid="pw-acc-min" className="text-xs text-slate-500">
        min sample {MIN_ACCURACY_SAMPLE}
      </p>
    </div>
  );
}
