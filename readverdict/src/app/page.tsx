import Link from 'next/link';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';

export const metadata: Metadata = {
  title: 'ReadVerdict — the decision engine for what you read next',
};

const STEPS = [
  { n: '01', title: 'Empanel your jury', body: 'A 60-second interview — or import your history — builds your Reader DNA.' },
  { n: '02', title: 'Put a book on trial', body: 'Search any book. ReadVerdict argues both sides from real evidence and your taste.' },
  { n: '03', title: 'Get the verdict', body: 'A decisive call — Read it, Borrow, Sample, Skip — with a finish prediction and why.' },
];

export default function HomePage() {
  return (
    <div className="animate-fade-up space-y-16">
      <section className="pt-6 sm:pt-12">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-copper-300">
          Part of the Verdict family
        </p>
        <h1 className="max-w-3xl font-display text-display-lg font-bold text-ivory-50">
          The decision engine for
          <br />
          <span className="text-copper-400">what you read next.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-ivory-300">
          Goodreads records what happened. StoryGraph analyzes your patterns.
          <strong className="text-ivory-100"> ReadVerdict makes the call.</strong> Every
          book gets a personalized trial — and you get the verdict.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/onboarding" className="btn-brass">Empanel your jury</Link>
          <Link href="/search" className="btn-ghost">Put a book on trial</Link>
        </div>

        <p className="mt-6 docket">Every book gets a trial. You get the verdict.</p>
      </section>

      <section aria-labelledby="how" className="grid gap-4 sm:grid-cols-3">
        <h2 id="how" className="sr-only">How it works</h2>
        {STEPS.map((s) => (
          <Card key={s.n} padding="lg">
            <span className="font-mono text-sm text-copper-300">{s.n}</span>
            <h3 className="mt-2 font-display text-xl font-semibold text-ivory-50">{s.title}</h3>
            <p className="mt-2 text-sm text-ivory-300">{s.body}</p>
          </Card>
        ))}
      </section>

      <section>
        <PageHeader
          eyebrow="Why it's different"
          title="It reduces the choice, not expands it"
          description="No infinite feed. No wall of covers. A fast, explainable answer to one question: is this book worth committing your next several hours to?"
        />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Card padding="lg">
            <h3 className="font-display text-lg font-semibold text-ivory-50">Honest evidence</h3>
            <p className="mt-2 text-ivory-300">
              Every charge, argument, and verdict is tied to real signals — each labelled
              confirmed, sourced, inferred, or insufficient. We never fabricate ratings,
              completion rates, or reader stats.
            </p>
          </Card>
          <Card padding="lg">
            <h3 className="font-display text-lg font-semibold text-ivory-50">Predicted DNF</h3>
            <p className="mt-2 text-ivory-300">
              A transparent finish-probability model tells you where you might struggle —
              and says so honestly when the evidence is thin.
            </p>
          </Card>
        </div>
      </section>
    </div>
  );
}
