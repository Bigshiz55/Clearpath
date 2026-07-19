import type { Metadata } from 'next';
import { ShareTargetHandler } from '@/components/ShareTargetHandler';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Adding… · WatchVrdikt' };

export default function ShareTargetPage({
  searchParams,
}: {
  searchParams: { title?: string; text?: string; url?: string };
}) {
  const text = [searchParams.title, searchParams.text, searchParams.url].filter(Boolean).join(' ').trim();
  return (
    <div className="mx-auto max-w-md py-4">
      <ShareTargetHandler text={text} />
    </div>
  );
}
