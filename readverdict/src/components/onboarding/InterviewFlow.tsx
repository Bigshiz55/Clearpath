'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { INTERVIEW_QUESTIONS, interviewToObservations } from '@/lib/onboarding/interview';
import { useStore } from '@/lib/store/StoreProvider';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';

export function InterviewFlow() {
  const store = useStore();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const total = INTERVIEW_QUESTIONS.length;
  const q = INTERVIEW_QUESTIONS[step]!;
  const progress = Math.round((step / total) * 100);

  const choose = (value: string) => {
    const next = { ...choices, [q.id]: value };
    setChoices(next);
    if (step + 1 < total) {
      setStep(step + 1);
    } else {
      finish(next);
    }
  };

  const finish = (finalChoices: Record<string, string>) => {
    const now = new Date().toISOString();
    const obs = interviewToObservations({ choices: finalChoices }, now);
    store.applyObservations(obs);
    store.setOnboarded(true);
    store.track('onboarding_completed', { answered: Object.keys(finalChoices).length });
    router.push('/reader-dna');
  };

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between text-sm text-ivory-400">
        <span>Question {step + 1} of {total}</span>
        <button type="button" onClick={() => finish(choices)} className="link-quiet">
          Skip the rest
        </button>
      </div>
      <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-ink-800" aria-hidden>
        <div className="h-full bg-copper-500 transition-all" style={{ width: `${progress}%` }} />
      </div>

      <Card padding="lg">
        <h2 className="font-display text-2xl font-semibold text-ivory-50">{q.prompt}</h2>
        <div className="mt-5 space-y-2">
          {q.options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => choose(opt.value)}
              className={cn(
                'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition',
                'border-ink-600 bg-ink-850 text-ivory-100 hover:border-copper-500/60 hover:bg-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-copper-300',
              )}
            >
              <span>{opt.label}</span>
              <span aria-hidden className="text-ivory-400">→</span>
            </button>
          ))}
        </div>
      </Card>

      <div className="mt-4 flex justify-between">
        <Button variant="ghost" size="sm" disabled={step === 0} onClick={() => setStep(Math.max(0, step - 1))}>
          Back
        </Button>
        <p className="self-center text-xs text-ivory-400">Your answers stay on this device.</p>
      </div>
    </div>
  );
}
