import type { Metadata } from 'next';
import { FounderTestEnv } from '@/components/founder/FounderTestEnv';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Amy · Founder Test',
  robots: { index: false, follow: false },
};

export default function TestAmyPage() {
  return <FounderTestEnv founder="amy" />;
}
