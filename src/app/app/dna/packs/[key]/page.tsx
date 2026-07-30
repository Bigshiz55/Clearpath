import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DnaQuiz } from '@/components/DnaQuiz';
import { packByKey, packSource } from '@/lib/preference/packs';
import { loadDnaSignals, countAnswersBySource } from '@/lib/preference/dnaSignals';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { key: string } }): Promise<Metadata> {
  const pack = packByKey(params.key);
  return { title: pack ? `${pack.name} booster · WatchVerd1ct` : 'DNA booster' };
}

/**
 * Run one optional calibration pack. It reuses the finite quiz UI in "pack mode":
 * no Quiz Progress metric (that belongs to onboarding), just the DNA Confidence
 * meter, and answers tagged `pack:<key>` so they raise confidence only.
 */
export default async function PackRunnerPage({ params }: { params: { key: string } }) {
  const pack = packByKey(params.key);
  if (!pack) notFound();

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const tally = user ? await loadDnaSignals(supabase, user.id) : undefined;
  const answered = user ? await countAnswersBySource(supabase, user.id, packSource(pack.key)) : 0;

  return (
    <DnaQuiz
      initialTally={tally}
      calibration={{
        total: pack.size,
        answered,
        showQuizProgress: false,
        source: packSource(pack.key),
        endpoint: `/api/calibration/pack?key=${encodeURIComponent(pack.key)}`,
        doneHref: '/app/dna/packs',
        label: `${pack.emoji} ${pack.name} booster`,
      }}
    />
  );
}
