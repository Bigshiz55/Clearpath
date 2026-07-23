'use client';

import { useState } from 'react';
import type { Trial } from '@/lib/trial/types';
import type { BookRef } from '@/lib/store/types';
import { inferBookDna } from '@/lib/dna/inferBookDna';
import { tierForScore } from '@/lib/verdict/tiers';
import { useStore } from '@/lib/store/StoreProvider';
import { ScoreDial } from '@/components/ui/ScoreDial';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BookCover } from '@/components/trial/BookCover';
import { EvidenceStatusTag } from './EvidenceStatusTag';
import { CrossExamination } from './CrossExamination';
import { finishPhrase } from '@/lib/trial/predict';
import { durationLabel, readingTimeLabel } from '@/lib/format';
import { MicroFeedback } from './MicroFeedback';
import { ShareVerdict } from './ShareVerdict';

function Section({ title, exhibit, children }: { title: string; exhibit?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-3">
        {exhibit && <span className="exhibit-label">{exhibit}</span>}
        <h2 className="font-display text-xl font-semibold text-ivory-50">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function TrialView({ trial, bookRef }: { trial: Trial; bookRef: BookRef }) {
  const store = useStore();
  const [saved, setSaved] = useState<string | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<'save' | 'pass' | 'start' | null>(null);
  const { defendant, verdict, prediction, jury } = trial;
  const tier = tierForScore(verdict.matchScore).tier;
  const crossCtx = {
    book: inferBookDna({ subjects: bookRef.subjects, pageCount: bookRef.pageCount }),
    seriesPosition: defendant.seriesPosition,
    hasAudio: defendant.audioDurationMin != null,
  };

  const act = (status: 'saved' | 'interested' | 'reading', kind: 'save' | 'pass' | 'start') => {
    const id = store.addToLibrary(bookRef, status, 'trial');
    setSaved(id);
    setFeedbackFor(kind);
    store.track('verdict_action', { action: kind, workId: bookRef.workId, matchScore: verdict.matchScore });
  };

  const pass = () => {
    store.track('verdict_pass', { workId: bookRef.workId, matchScore: verdict.matchScore });
    setFeedbackFor('pass');
  };

  return (
    <article className="animate-fade-up pb-4">
      <p className="docket">{trial.docket}</p>
      <h1 className="mt-1 font-display text-display-sm font-bold text-ivory-50">{trial.caseName}</h1>

      {/* Verdict seal — the immediate answer */}
      <Card padding="lg" className="mt-5 paper-grain">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <BookCover url={defendant.coverUrl} title={defendant.title} className="h-28 w-[76px] shrink-0" />
            <ScoreDial score={verdict.matchScore} tier={tier} size={116} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="file-stamp">{verdict.call}</span>
            <p className="mt-3 text-sm text-ivory-300">
              Reader Match <strong className="text-ivory-50">{verdict.matchScore}</strong> ·{' '}
              {verdict.matchConfidence} confidence
            </p>
            <p className="text-sm text-ivory-300">{finishPhrase(prediction)}</p>
            {verdict.bestFormat && <p className="text-sm text-ivory-300">Best format: {verdict.bestFormat}</p>}
            <p className="mt-2 font-display text-lg text-ivory-100">{verdict.sentence}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => act('reading', 'start')}>Start reading</Button>
          <Button size="sm" variant="secondary" onClick={() => act('saved', 'save')}>Save</Button>
          <Button size="sm" variant="secondary" onClick={() => act('interested', 'save')}>Interested</Button>
          <Button size="sm" variant="ghost" onClick={pass}>Pass</Button>
          <ShareVerdict trial={trial} workId={bookRef.workId} />
        </div>
        {saved && <p className="mt-2 text-xs text-verdict-must">Added to My Books.</p>}
        {feedbackFor && (
          <MicroFeedback
            kind={feedbackFor}
            onPick={(reason) => {
              store.track('micro_feedback', { context: feedbackFor, reason, workId: bookRef.workId });
              setFeedbackFor(null);
            }}
          />
        )}
      </Card>

      {/* Defendant facts */}
      <Section title="The defendant" exhibit="Exhibit A">
        <Card>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 p-5 text-sm sm:grid-cols-3">
            <Fact label="Author" value={defendant.author} />
            <Fact label="Published" value={defendant.year?.toString() ?? null} />
            <Fact label="Pages" value={defendant.pageCount?.toString() ?? null} />
            <Fact label="Reading time" value={readingTimeLabel(defendant.pageCount)} />
            <Fact label="Audiobook" value={durationLabel(defendant.audioDurationMin)} />
            <Fact label="Series" value={defendant.series} />
          </dl>
        </Card>
      </Section>

      {/* Charges */}
      <Section title="The charges" exhibit="Docket">
        <Card>
          <ul className="space-y-2 p-5 text-ivory-100">
            {trial.charges.map((c, i) => (
              <li key={i} className="flex gap-2 font-display">
                <span className="text-oxblood-400">§</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      {/* Prosecution & Defense */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <ArgumentCard title="The prosecution" accent="text-oxblood-400" points={trial.prosecution} empty="No strong case for skipping — the prosecution rests." />
        <ArgumentCard title="The defense" accent="text-verdict-must" points={trial.defense} empty="Limited affirmative evidence yet — add reading history to strengthen it." />
      </div>

      {/* Evidence */}
      <Section title="The evidence" exhibit="Exhibits">
        <Card>
          <ul className="divide-y divide-ink-800">
            {trial.evidence.map((e) => (
              <li key={e.key} className="flex items-center justify-between gap-4 px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-ivory-100">{e.label}</p>
                  <p className="text-sm text-ivory-300">{e.value ?? 'Not available'}</p>
                </div>
                <EvidenceStatusTag status={e.status} />
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      {/* Witnesses */}
      <Section title="The witnesses" exhibit="Testimony">
        {trial.witnesses.map((w, i) => (
          <Card key={i} className="mb-2">
            <div className="flex items-start justify-between gap-4 p-5">
              <div>
                <p className="text-sm font-semibold text-ivory-100">{w.group}</p>
                <p className="mt-1 text-sm text-ivory-300">{w.statement}</p>
              </div>
              <EvidenceStatusTag status={w.status} />
            </div>
          </Card>
        ))}
      </Section>

      {/* Cross-examination */}
      <Section title="Cross-examination" exhibit="Q&A">
        <Card padding="lg">
          <CrossExamination ctx={crossCtx} onAsk={(id) => store.track('cross_examination', { question: id, workId: bookRef.workId })} />
        </Card>
      </Section>

      {/* Jury */}
      <Section title="The jury" exhibit="Verdict form">
        <Card padding="lg">
          <p className="font-display text-lg text-ivory-50">{jury.headline}</p>
          <p className="mt-1 text-sm text-ivory-300">{jury.rationale}</p>
          {jury.dissent && <p className="mt-1 text-sm text-oxblood-400">{jury.dissent}</p>}
          <p className="mt-3 text-xs text-ivory-400">
            Basis: {jury.basis === 'modeled-similarity' ? 'modeled similarity (not real cohort votes yet)' : 'cohort data'} · confidence {jury.confidence}
          </p>
        </Card>
      </Section>

      <p className="mt-6 rounded-lg border border-ink-700 bg-ink-900/60 px-4 py-3 text-xs text-ivory-400">
        {trial.confidenceNote}
      </p>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ivory-400">{label}</dt>
      <dd className={value ? 'text-ivory-100' : 'text-ivory-400'}>{value ?? 'Unknown'}</dd>
    </div>
  );
}

function ArgumentCard({
  title,
  accent,
  points,
  empty,
}: {
  title: string;
  accent: string;
  points: Trial['prosecution'];
  empty: string;
}) {
  return (
    <Card padding="lg">
      <h2 className={`mb-3 font-display text-lg font-semibold ${accent}`}>{title}</h2>
      {points.length === 0 ? (
        <p className="text-sm text-ivory-300">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {points.map((p, i) => (
            <li key={i}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ivory-100">{p.label}</span>
                <EvidenceStatusTag status={p.status} />
              </div>
              <p className="text-sm text-ivory-300">{p.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
