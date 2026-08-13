import { notFound } from 'next/navigation';
import { VerdictRoomEntrance } from '@/components/court/VerdictRoomEntrance';

/**
 * The Verdict Room entrance harness (gated by MOBILE_HARNESS=1).
 *
 * It renders the REAL `VerdictRoomEntrance` inside the same shell the app
 * layout provides (`main.container-page py-6`) — which matters, because the
 * composition bleeds to the screen edges by cancelling exactly that padding.
 * A harness that reproduced the page's markup instead of using the component
 * would drift from it, and this one used to: it carried its own copy of the
 * old heading, CTA and cards.
 *
 * 404 in any normal build.
 */
export const dynamic = 'force-dynamic';

export default function TogetherHarnessPage() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return (
    <main className="container-page py-6" data-testid="together-harness">
      <VerdictRoomEntrance />
    </main>
  );
}
