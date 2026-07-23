import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Card } from '@/components/ui/Card';
import { Field, Textarea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Divider } from '@/components/ui/Divider';
import { InterpretationPreview } from '@/components/ask/InterpretationPreview';

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
    <div className="animate-fade-up space-y-10">
      <PageHeader
        eyebrow="The center of ReadVerdict"
        title="Ask ReadVerdict"
        description="Tell it what you want in plain words or by voice. It interprets the request into editable chips, then returns a short ranked set — with a verdict and why."
      />

      {/* Non-functional preview of the Ask surface. Parser + results land in Phase 4. */}
      <Card padding="lg">
        <Field
          label="Your request"
          htmlFor="ask-input"
          hint="Interpretation & live results arrive in Phase 4."
        >
          <div className="relative">
            <Textarea
              id="ask-input"
              rows={3}
              disabled
              placeholder="e.g. I loved The Silent Patient but want something less dark…"
            />
            <button
              type="button"
              disabled
              aria-label="Voice input (coming in Phase 4)"
              className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-lg border border-obsidian-600 text-ivory-400 opacity-70"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
                <path d="M6 11a6 6 0 0 0 12 0M12 17v3" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </Field>
        <div className="mt-4 flex justify-end">
          <Button disabled>Get the verdict</Button>
        </div>

        <Divider label="What it understood" className="my-6" />

        <InterpretationPreview />
      </Card>

      <section aria-labelledby="examples-heading">
        <h2 id="examples-heading" className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-ivory-400">
          Requests it is designed to answer
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {EXAMPLES.map((ex) => (
            <li
              key={ex}
              className="rounded-xl border border-obsidian-700 bg-obsidian-900/60 px-4 py-3 text-ivory-200"
            >
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
