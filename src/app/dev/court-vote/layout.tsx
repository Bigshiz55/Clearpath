import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function HarnessLayout({ children }: { children: React.ReactNode }) {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return <>{children}</>;
}
