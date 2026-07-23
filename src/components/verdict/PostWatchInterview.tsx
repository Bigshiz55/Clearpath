'use client';

import { useState } from 'react';
import { submitInterview } from '@/lib/actions/interview';
import { useToast } from '@/components/Toast';
import { useT } from '@/i18n/I18nProvider';
import type { InterviewQuestion, Disposition } from '@/lib/interview';

export function PostWatchInterview({
  tmdbId,
  mediaType,
  disposition,
  questions,
}: {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  disposition: Disposition;
  questions: InterviewQuestion[];
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const t = useT();

  if (questions.length === 0 || done) return null;

  const answered = Object.keys(answers).length;

  async function save(finalAnswers: Record<string, string>) {
    setBusy(true);
    const res = await submitInterview({ tmdbId, mediaType, disposition, answers: finalAnswers });
    setBusy(false);
    if (res.ok) {
      setDone(true);
      if (res.nudged && res.nudged.length > 0) {
        toast.show(t('title.interview.nudged', { traits: res.nudged.join(' & ') }), 'success');
      } else {
        toast.show(t('title.interview.thanks'), 'success');
      }
    } else {
      toast.show(res.error ?? t('title.interview.couldNotSave'), 'error');
    }
  }

  function pick(qKey: string, value: string) {
    const next = { ...answers, [qKey]: value };
    setAnswers(next);
    // When the last question is answered, save automatically.
    if (Object.keys(next).length >= questions.length) save(next);
  }

  return (
    <section className="card border-brand-400/30 bg-brand-500/[0.06] p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">🎬 {t('title.interview.heading')}</h2>
        <span className="text-xs text-slate-500">{answered}/{questions.length}</span>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        {t('title.interview.blurb')}
      </p>

      <div className="mt-4 space-y-4">
        {questions.map((q) => (
          <div key={q.key}>
            <div className="text-sm font-semibold text-white">{q.prompt}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {q.options.map((o) => {
                const active = answers[q.key] === o.value;
                return (
                  <button
                    key={o.value}
                    onClick={() => pick(q.key, o.value)}
                    disabled={busy}
                    className={`rounded-xl border px-3.5 py-2 text-sm font-medium transition ${
                      active
                        ? 'border-brand-400/70 bg-brand-500/25 text-brand-100'
                        : 'border-white/12 bg-white/5 text-slate-200 hover:bg-white/10'
                    } disabled:opacity-50`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button onClick={() => setDone(true)} className="btn-ghost mt-4 text-sm">{t('title.interview.skip')}</button>
    </section>
  );
}
