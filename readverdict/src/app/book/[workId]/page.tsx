import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBook } from '@/lib/books/openLibrary';
import { buildVerdict } from '@/lib/scoring';
import type { ReadingOption } from '@/lib/types';
import { BookCover } from '@/components/BookCover';
import { ScoreDial } from '@/components/ScoreDial';
import { tierColor, callClasses } from '@/components/verdictStyle';
import { tidySubject } from '@/lib/format';

export async function generateMetadata({
  params,
}: {
  params: { workId: string };
}): Promise<Metadata> {
  const book = await getBook(params.workId);
  if (!book) return { title: 'Book not found' };
  const author = book.authors[0] ? ` by ${book.authors[0]}` : '';
  return {
    title: `${book.title} — verdict`,
    description: `ReadVerdict for ${book.title}${author}.`,
  };
}

export default async function BookVerdictPage({
  params,
}: {
  params: { workId: string };
}) {
  const book = await getBook(params.workId);
  if (!book) notFound();

  const verdict = buildVerdict({ meta: book });
  const { general, tier, primaryCall } = verdict;

  return (
    <article className="animate-fade-up">
      <Link href="/search" className="text-sm text-ink-500 hover:text-paper-200">
        ← Back to search
      </Link>

      {/* Hero */}
      <header className="mt-4 grid gap-6 sm:grid-cols-[auto,1fr]">
        <BookCover
          coverId={book.coverId}
          title={book.title}
          size="L"
          className="h-52 w-36 sm:h-64 sm:w-44"
        />

        <div className="min-w-0">
          <h1 className="font-serif text-3xl font-bold leading-tight text-paper-50">
            {book.title}
          </h1>
          {book.subtitle && (
            <p className="mt-1 font-serif text-lg text-paper-200">{book.subtitle}</p>
          )}
          <p className="mt-2 text-paper-200">
            {book.authors.length > 0 ? book.authors.join(', ') : 'Unknown author'}
            {book.firstPublishYear != null && (
              <span className="text-ink-500"> · {book.firstPublishYear}</span>
            )}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <ScoreDial score={general.score} tier={tier} />
            <div>
              <span
                className={`inline-flex rounded-full border px-4 py-1.5 text-sm font-bold tracking-wide ${callClasses(
                  primaryCall,
                )}`}
              >
                {primaryCall}
              </span>
              <p className={`mt-2 font-serif text-2xl font-bold ${tierColor(tier)}`}>
                {tier}
              </p>
              <p className="mt-1 max-w-md text-paper-200">{verdict.oneLiner}</p>
              <p className="mt-1 text-xs text-ink-500">
                Confidence: {general.confidence}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Score breakdown */}
      <section className="mt-10">
        <h2 className="mb-3 font-serif text-xl font-semibold text-paper-50">
          How the score is built
        </h2>
        <div className="card grid gap-px overflow-hidden bg-ink-800 sm:grid-cols-4">
          <Component label="Reader acclaim" value={general.breakdown.acclaim} />
          <Component label="Popularity" value={general.breakdown.popularity} />
          <Component label="Readability" value={general.breakdown.readability} />
          <Component label="Staying power" value={general.breakdown.stayingPower} />
        </div>
        <p className="mt-2 text-xs text-ink-500">
          Weighted blend: acclaim 42% · popularity 20% · readability 20% ·
          staying power 18%. Data reliability:{' '}
          {general.breakdown.dataReliability}.
        </p>
      </section>

      {/* Reasons */}
      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 font-serif text-lg font-semibold text-verdict-must">
            Reasons to read
          </h2>
          <ul className="space-y-2 text-sm text-paper-100">
            {verdict.reasonsFor.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-verdict-must">+</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="mb-3 font-serif text-lg font-semibold text-verdict-skip">
            Reasons to pass
          </h2>
          <ul className="space-y-2 text-sm text-paper-100">
            {verdict.reasonsAgainst.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-verdict-skip">−</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Signals */}
      <section className="mt-10">
        <h2 className="mb-3 font-serif text-xl font-semibold text-paper-50">
          Reading signals
        </h2>
        <div className="card divide-y divide-ink-800">
          {verdict.signals.map((s) => (
            <div key={s.label} className="flex items-baseline justify-between gap-4 px-5 py-3">
              <span className="text-sm font-medium text-ink-500">{s.label}</span>
              <span className="text-right text-sm text-paper-100">{s.note}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Where to read */}
      <section className="mt-10">
        <h2 className="mb-3 font-serif text-xl font-semibold text-paper-50">
          Where to read it
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {verdict.readingOptions.map((o, i) => (
            <ReadingOptionCard key={i} option={o} />
          ))}
        </div>
      </section>

      {/* Rating consensus */}
      <section className="mt-10">
        <h2 className="mb-3 font-serif text-xl font-semibold text-paper-50">
          Rating consensus
        </h2>
        <div className="card p-5">
          {general.sources.map((src) => (
            <div key={src.name} className="flex items-center justify-between py-1.5 text-sm">
              <span className="text-paper-200">{src.name}</span>
              <span className={src.available ? 'text-paper-50' : 'text-ink-500'}>
                {src.available ? src.raw : 'Not available'}
              </span>
            </div>
          ))}
          <p className="mt-3 border-t border-ink-800 pt-3 text-xs text-ink-500">
            Acclaim blend: {general.acclaimScore}/100 ({general.acclaimConfidence}{' '}
            confidence). Ratings are shown exactly as reported by Open Library.
          </p>
        </div>
      </section>

      {/* Description */}
      {book.description && (
        <section className="mt-10">
          <h2 className="mb-3 font-serif text-xl font-semibold text-paper-50">
            About the book
          </h2>
          <p className="whitespace-pre-line font-serif leading-relaxed text-paper-100">
            {book.description}
          </p>
        </section>
      )}

      {/* Subjects */}
      {book.subjects.length > 0 && (
        <section className="mt-8">
          <div className="flex flex-wrap gap-2">
            {book.subjects.slice(0, 10).map((s) => (
              <span key={s} className="pill">
                {tidySubject(s)}
              </span>
            ))}
          </div>
        </section>
      )}

      <p className="mt-10 text-xs text-ink-500">
        <a
          href={`https://openlibrary.org/works/${book.workId}`}
          className="link-quiet"
          target="_blank"
          rel="noreferrer"
        >
          View this work on Open Library ↗
        </a>
      </p>
    </article>
  );
}

function Component({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-ink-900 p-4">
      <p className="text-2xl font-bold text-paper-50">{value}</p>
      <p className="mt-1 text-xs text-ink-500">{label}</p>
    </div>
  );
}

function ReadingOptionCard({ option }: { option: ReadingOption }) {
  const tint: Record<ReadingOption['kind'], string> = {
    'read-free': 'text-verdict-must',
    borrow: 'text-accent-300',
    buy: 'text-paper-200',
    info: 'text-paper-200',
  };
  const body = (
    <div className="card h-full p-4 transition hover:border-accent-500/50">
      <p className={`font-semibold ${tint[option.kind]}`}>{option.label}</p>
      <p className="mt-1 text-sm text-paper-200">{option.detail}</p>
    </div>
  );
  return option.href ? (
    <a href={option.href} target="_blank" rel="noreferrer">
      {body}
    </a>
  ) : (
    body
  );
}
