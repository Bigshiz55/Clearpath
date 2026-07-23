import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { InterpretationChip } from '@/components/ui/InterpretationChip';
import { VerdictBadge } from '@/components/ui/VerdictBadge';
import { StatusPill, type BookStatus } from '@/components/ui/StatusPill';
import { ScoreDial } from '@/components/ui/ScoreDial';
import { Rating } from '@/components/ui/Rating';
import { Avatar } from '@/components/ui/Avatar';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Skeleton, ResultCardSkeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { Divider } from '@/components/ui/Divider';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import type { VerdictTier } from '@/lib/verdict/tiers';
import { SegmentedControlDemo } from '@/components/styleguide/InteractiveBits';

export const metadata: Metadata = {
  title: 'Style Guide',
  robots: { index: false, follow: false },
};

const TIERS: VerdictTier[] = ['Must Read', 'Strong Yes', 'Worth a Look', 'Maybe', 'Probably Pass'];
const TIER_SCORES: Record<VerdictTier, number> = {
  'Must Read': 91,
  'Strong Yes': 78,
  'Worth a Look': 63,
  Maybe: 51,
  'Probably Pass': 28,
};
const STATUSES: BookStatus[] = ['Saved', 'Interested', 'Reading', 'Finished', 'DNF', 'Paused', 'Want to reread'];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="border-b border-obsidian-700/70 pb-2 font-display text-xl font-semibold text-ivory-50">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function StyleGuidePage() {
  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Design system"
        title="Style guide"
        description="A living reference for the ReadVerdict component library and tokens. Internal — not linked from the product nav."
      />

      <Section title="Color tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Obsidian 900', 'bg-obsidian-900'],
            ['Obsidian 700', 'bg-obsidian-700'],
            ['Brass 500', 'bg-brass-500'],
            ['Brass 300', 'bg-brass-300'],
            ['Signal 400', 'bg-signal-400'],
            ['Ivory 100', 'bg-ivory-100'],
            ['Verdict must', 'bg-verdict-must'],
            ['Verdict pass', 'bg-verdict-pass'],
          ].map(([label, cls]) => (
            <div key={label} className="overflow-hidden rounded-xl border border-obsidian-700">
              <div className={`h-14 ${cls}`} />
              <div className="px-3 py-2 text-xs text-ivory-300">{label}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="space-y-2">
          <p className="font-display text-display-lg font-bold text-ivory-50">Display large</p>
          <p className="font-display text-display-md font-bold text-ivory-50">Display medium</p>
          <p className="font-display text-display-sm font-bold text-ivory-50">Display small</p>
          <p className="text-lg text-ivory-200">Body large — the right book, not more books.</p>
          <p className="text-sm text-ivory-300">Body small — honest signals, no fabricated data.</p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button href="/ask" variant="secondary">As link →</Button>
        </div>
      </Section>

      <Section title="Verdict badges & score dials">
        <div className="flex flex-wrap gap-2">
          {TIERS.map((t) => (
            <VerdictBadge key={t} tier={t} />
          ))}
        </div>
        <div className="flex flex-wrap gap-6">
          {TIERS.map((t) => (
            <ScoreDial key={t} tier={t} score={TIER_SCORES[t]} size={104} />
          ))}
        </div>
      </Section>

      <Section title="Chips & interpretation chips">
        <div className="flex flex-wrap gap-2">
          <Chip>Neutral</Chip>
          <Chip tone="brass">Brass</Chip>
          <Chip tone="signal">Signal</Chip>
          <Chip tone="positive">Positive</Chip>
          <Chip tone="negative">Negative</Chip>
        </div>
        <div className="flex flex-wrap gap-2">
          <InterpretationChip label="Standalone" tone="brass" />
          <InterpretationChip label="No supernatural" tone="negative" />
          <InterpretationChip label="Muted example" tone="signal" muted />
        </div>
      </Section>

      <Section title="Status pills">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <StatusPill key={s} status={s} />
          ))}
        </div>
      </Section>

      <Section title="Ratings & avatars">
        <div className="flex flex-wrap items-center gap-6">
          <Rating value={4.3} count={318} />
          <Rating value={2.5} />
          <Rating value={null} />
        </div>
        <div className="flex items-center gap-3">
          <Avatar name="Scott" />
          <Avatar name="Heather" />
          <Avatar name="Gabriel García Márquez" />
          <Avatar name="Book Club" size="lg" />
        </div>
      </Section>

      <Section title="Form controls">
        <div className="grid gap-4 sm:max-w-md">
          <Field label="Text input" htmlFor="sg-input" hint="A short hint sits here.">
            <Input id="sg-input" placeholder="Type something…" />
          </Field>
          <Field label="With error" htmlFor="sg-input-2" error="This field is required.">
            <Input id="sg-input-2" aria-invalid />
          </Field>
          <Field label="Textarea" htmlFor="sg-textarea">
            <Textarea id="sg-textarea" rows={3} placeholder="Multi-line…" />
          </Field>
        </div>
      </Section>

      <Section title="Segmented control">
        <SegmentedControlDemo />
      </Section>

      <Section title="Loading & skeletons">
        <Spinner label="Loading…" />
        <div className="grid gap-3 sm:grid-cols-2">
          <ResultCardSkeleton />
          <div className="card space-y-3 p-5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        </div>
      </Section>

      <Section title="Dividers">
        <Divider />
        <Divider label="Or" />
      </Section>

      <Section title="Empty & error states">
        <div className="grid gap-4 sm:grid-cols-2">
          <EmptyState phase="Phase N" title="Nothing here yet" body="An honest, phase-labeled placeholder." />
          <ErrorState retryHref="/style-guide" />
        </div>
      </Section>
    </div>
  );
}
