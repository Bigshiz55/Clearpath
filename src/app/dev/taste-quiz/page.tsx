import { notFound } from 'next/navigation';
import { QuickTasteQuiz } from '@/components/QuickTasteQuiz';

/**
 * Quick Taste Quiz harness (gated by MOBILE_HARNESS=1).
 *
 * Renders the REAL component — same selection, same rows, same chips, same live
 * DNA panel — with `canSave` off, so Playwright can drive the whole interaction
 * without a Supabase session and without writing anything. 404 in any normal
 * build.
 */
export const dynamic = 'force-dynamic';

export default function TasteQuizHarnessPage() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return (
    <div className="min-h-dvh bg-ink-950 p-4">
      <div className="mx-auto w-full max-w-5xl">
        <QuickTasteQuiz canSave={false} />
      </div>
    </div>
  );
}
