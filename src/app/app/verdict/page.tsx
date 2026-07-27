import type { Metadata } from 'next';
import { VerdictDelivery } from '@/components/VerdictDelivery';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'The Verd1ct · WatchVerdict' };

/**
 * The single-watcher decision. Everything it needs is on the client — the
 * docket lives in the browser, and the facts come from the same per-title
 * endpoints every card already calls — so this page is a shell on purpose.
 */
export default function VerdictPage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <VerdictDelivery />
    </div>
  );
}
