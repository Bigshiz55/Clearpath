import type { Metadata } from 'next';
import { CourtRoom } from '@/components/court/CourtRoom';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Court · WatchVerd1ct' };

export default function CourtRoomPage({ params }: { params: { code: string } }) {
  return <CourtRoom code={params.code} />;
}
