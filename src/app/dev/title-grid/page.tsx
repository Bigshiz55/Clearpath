import { notFound } from 'next/navigation';
import { TitleGridCalibration } from '@/components/TitleGridCalibration';

/**
 * Title-grid harness (gated by MOBILE_HARNESS=1). Renders the REAL component;
 * the suite intercepts `/api/calibration` so the grid can be driven without a
 * Supabase session. 404 in any normal build.
 */
export const dynamic = 'force-dynamic';

export default function TitleGridHarnessPage() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return (
    <div className="min-h-dvh bg-ink-950 p-4">
      <div className="mx-auto w-full max-w-5xl">
        <TitleGridCalibration />
      </div>
    </div>
  );
}
