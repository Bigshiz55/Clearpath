import { notFound } from 'next/navigation';
import { RapidFireDemo } from '@/components/RapidFireDemo';

export const dynamic = 'force-dynamic';

/** Harness only — /app/* redirects to /login without a session. */
export default function DevRapidFire() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return (
    <div className="container-page py-6">
      <RapidFireDemo />
    </div>
  );
}
