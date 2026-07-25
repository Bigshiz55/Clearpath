import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { serverEnv } from '@/lib/env';
import { resolveFounderAccess } from '@/lib/founder/gate';
import { FounderAccessForm } from '@/components/founder/FounderAccessForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Founder access',
  robots: { index: false, follow: false, nocache: true },
};

/**
 * TEMPORARY founder access, for while public sign-in is disabled.
 *
 * If no code is configured this route 404s — the flow does not advertise
 * itself as "available but unconfigured", which would tell a visitor there is
 * something here to come back for.
 *
 * An already-authorised founder is sent straight on, so the form is never a
 * second obstacle to someone who is already in.
 */
export default async function FounderAccessPage() {
  if (!serverEnv.founderAccessCode()) notFound();
  if ((await resolveFounderAccess()).allowed) redirect('/founder/recommendation-lab');
  return <FounderAccessForm />;
}
