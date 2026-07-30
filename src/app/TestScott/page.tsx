import type { Metadata } from 'next';
import { FounderTestEnv } from '@/components/founder/FounderTestEnv';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Scott · Founder Test',
  robots: { index: false, follow: false },
};

export default function TestScottPage() {
  return <FounderTestEnv founder="scott" />;
}
