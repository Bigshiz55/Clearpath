import type { Metadata } from 'next';
import { VerdictRoomEntrance } from '@/components/court/VerdictRoomEntrance';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'The Verdict Room · WatchVerd1ct',
};

/**
 * THE VERDICT ROOM — the entrance to one of WatchVerd1ct's signature
 * experiences, composed as a full screen rather than a launcher.
 *
 * The page itself is deliberately thin: the whole composition (the shadow
 * room behind the glass, the identity, the entrance control, the two modes and
 * the crew rail) lives in `VerdictRoomEntrance`, which is where its reasoning
 * is documented. Room creation, Quick Pick, Invite the Jury and saved Crews
 * all behave exactly as they did.
 */
export default function TogetherPage() {
  return <VerdictRoomEntrance />;
}
