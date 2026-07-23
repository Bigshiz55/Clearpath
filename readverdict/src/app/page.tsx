import Link from 'next/link';
import { SearchBar } from '@/components/SearchBar';

const EXAMPLES = [
  'Pride and Prejudice',
  'Dune',
  'The Name of the Wind',
  'Sapiens',
  'Educated',
];

export default function HomePage() {
  return (
    <div className="animate-fade-up">
      <section className="mx-auto max-w-2xl pt-8 text-center sm:pt-16">
        <p className="pill mx-auto mb-6">Powered by Open Library · no account needed</p>
        <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight text-paper-50 sm:text-5xl">
          Should you read it?
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-paper-200">
          Search any book and get a clear <strong className="text-accent-300">ReadVerdict</strong>{' '}
          — a transparent 0–100 score, honest signals about length and
          availability, and where to read it.
        </p>

        <div className="mt-8">
          <SearchBar autoFocus />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="text-ink-500">Try:</span>
          {EXAMPLES.map((title) => (
            <Link
              key={title}
              href={`/search?q=${encodeURIComponent(title)}`}
              className="pill hover:border-accent-500/50 hover:text-accent-200"
            >
              {title}
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-16 grid max-w-4xl gap-4 sm:grid-cols-3">
        <Feature
          title="Transparent score"
          body="A deterministic 0–100 engine blends reader acclaim, reach, readability, and staying power. Every input is shown."
        />
        <Feature
          title="Honest data"
          body="Ratings, availability, and edition counts come straight from Open Library. Missing data is labelled, never invented."
        />
        <Feature
          title="Clear call"
          body="Read it, maybe, or skip — with the specific reasons for and against, and where you can actually get the book."
        />
      </section>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="card p-5">
      <h2 className="font-serif text-lg font-semibold text-paper-50">{title}</h2>
      <p className="mt-2 text-sm text-paper-200">{body}</p>
    </div>
  );
}
