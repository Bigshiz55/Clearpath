import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';
import { listSponsorsAdmin } from '@/lib/actions/adminSponsors';
import { SponsorAdmin } from '@/components/admin/SponsorAdmin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sponsors · Admin' };

export default async function SponsorAdminPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) notFound();

  const res = await listSponsorsAdmin();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">⚖️ Sponsored Judges</h1>
      <p className="mt-2 text-sm text-slate-400">
        Add and manage the brands that preside over the courtroom. Sponsors are presence + a coupon only — they
        never touch the verdict. “Claims” is your conversion count (the ROI you show them).
      </p>
      {!res.ok ? (
        <p className="mt-6 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          {res.error}
        </p>
      ) : (
        <div className="mt-6">
          <SponsorAdmin initialSponsors={res.sponsors} />
        </div>
      )}
    </div>
  );
}
