import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DnaQuiz } from '@/components/DnaQuiz';
import { packByKey } from '@/lib/preference/packs';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { key: string } }): Promise<Metadata> {
  const pack = packByKey(params.key);
  return { title: pack ? `${pack.name} booster · WatchVerd1ct` : 'DNA booster' };
}

/**
 * Run one optional calibration pack. The dedicated "pack mode" (a confidence
 * meter instead of Quiz Progress, answers tagged `pack:<key>`) doesn't exist
 * on the current single-screen DnaQuiz card flow, so this renders the same
 * card flow every other quiz surface uses — still a real, working quiz for
 * this route, just without the pack-specific progress framing.
 */
export default function PackRunnerPage({ params }: { params: { key: string } }) {
  const pack = packByKey(params.key);
  if (!pack) notFound();

  return <DnaQuiz />;
}
