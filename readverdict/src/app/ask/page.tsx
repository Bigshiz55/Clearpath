import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';

export const metadata: Metadata = { title: 'Ask' };

const EXAMPLES = [
  'Give me five books like Rocky, but an underdog story.',
  'A Sherlock-style mystery that is not supernatural.',
  'A fast thriller under 350 pages.',
  'An audiobook for a six-hour drive.',
  'Something Heather and I would both like.',
  'A book-club pick everyone will actually finish.',
];

export default function AskPage() {
  return (
    <div className="animate-fade-up space-y-8">
      <PageHeader
        eyebrow="The center of ReadVerdict"
        title="Ask ReadVerdict"
        description="Tell it what you want in plain words or by voice. It interprets the request into editable chips, then returns a short ranked set — with a verdict and why."
      />

      {/* Non-functional preview of the Ask surface. The parser + results land in Phase 4. */}
      <div className="card p-5">
        <label htmlFor="ask-input" className="mb-2 block text-sm font-medium text-ivory-200">
          Your request
        </label>
        <textarea
          id="ask-input"
          rows={3}
          disabled
          placeholder="e.g. I loved The Silent Patient but want something less dark…"
          className="w-full resize-none rounded-xl border border-obsidian-600 bg-obsidian-850 px-4 py-3 text-ivory-100 placeholder:text-ivory-400 focus:border-brass-500 focus:outline-none disabled:opacity-70"
          aria-describedby="ask-status"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p id="ask-status" className="text-sm text-ivory-400">
            Interpretation &amp; live results arrive in Phase 4.
          </p>
          <button type="button" disabled className="btn-brass opacity-60" aria-disabled>
            Get the verdict
          </button>
        </div>
      </div>

      <section aria-labelledby="examples-heading">
        <h2 id="examples-heading" className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-ivory-400">
          Requests it is designed to answer
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {EXAMPLES.map((ex) => (
            <li key={ex} className="rounded-xl border border-obsidian-700 bg-obsidian-900/60 px-4 py-3 text-ivory-200">
              “{ex}”
            </li>
          ))}
        </ul>
      </section>

      <EmptyState
        phase="Phase 4"
        title="Search DNA parser coming next"
        body="This surface will normalize each request into intent, seed books, hard constraints, soft preferences, format, availability, and reader/group context — every field with a confidence — then run the full recommendation pipeline."
      />
    </div>
  );
}
