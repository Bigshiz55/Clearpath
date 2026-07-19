import type { Metadata } from 'next';
import { LiveCourt } from '@/components/LiveCourt';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Taste Court · WatchVrdikt' };

export default function CourtRoomPage({ params }: { params: { code: string } }) {
  return <LiveCourt code={params.code} />;
}
