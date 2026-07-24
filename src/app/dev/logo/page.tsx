import { notFound } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { WatchVerdictWordmark } from '@/components/WatchVerdictWordmark';

/** Logo harness (gated by MOBILE_HARNESS=1) — renders the shared brand logo so
 *  Playwright can verify the WatchVERD1CT wordmark (white "1", pink treatment,
 *  never clipped, reduced-motion static). 404 in any normal build. */
export const dynamic = 'force-dynamic';

export default function LogoHarnessPage() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return (
    <div className="min-h-dvh space-y-8 p-8" data-testid="logo-harness">
      <div data-testid="logo-header"><Logo size="lg" /></div>
      <div data-testid="logo-md"><Logo /></div>
      <div className="text-4xl" data-testid="logo-word"><WatchVerdictWordmark /></div>
    </div>
  );
}
