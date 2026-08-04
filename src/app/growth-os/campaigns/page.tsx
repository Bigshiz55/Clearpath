import { createClient } from '@/lib/supabase/server';
import { createTrackedLink } from '@/lib/actions/growth';
import { shortLink } from '@/lib/growth/utm';
import { SetupNote } from '@/app/growth-os/crm/page';
import { publicEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

interface LinkRow {
  id: string; slug: string; label: string; destination: string; source: string;
  medium: string | null; campaign: string | null; click_count: number;
}

export default async function CampaignsPage() {
  const supabase = createClient();
  const origin = publicEnv.siteUrl();
  let links: LinkRow[] = [];
  let ready = true;
  try {
    const { data, error } = await supabase.from('growth_links').select('id,slug,label,destination,source,medium,campaign,click_count').order('created_at', { ascending: false }).limit(100);
    if (error) ready = false; else links = (data ?? []) as LinkRow[];
  } catch { ready = false; }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-black text-white">Campaigns & tracked links</h1>
        <p className="text-sm text-slate-400">Every link you share should be tracked, so you know exactly where each user came from.</p>
      </header>

      {!ready && <SetupNote />}

      <form action={createTrackedLink} className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <input name="label" placeholder="Label (e.g. Reddit MovieSuggestions post)" required className="col-span-2 rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-white placeholder:text-slate-500" />
        <input name="source" placeholder="Source (reddit, tiktok, friend…)" required className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-white placeholder:text-slate-500" />
        <input name="medium" placeholder="Medium (post, dm, referral)" className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-white placeholder:text-slate-500" />
        <input name="campaign" placeholder="Campaign (optional)" className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-white placeholder:text-slate-500" />
        <input name="content" placeholder="Variation (optional)" className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-white placeholder:text-slate-500" />
        <input name="destination" defaultValue="/app/taste-quiz" placeholder="Destination path" className="col-span-2 rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-white placeholder:text-slate-500" />
        <button className="col-span-2 rounded-lg bg-indigo-500 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-400">Create tracked link</button>
      </form>

      <div className="space-y-2">
        {links.length === 0 && ready && <p className="text-sm text-slate-500">No tracked links yet. Create one before you share anything — attribution starts at user #1.</p>}
        {links.map((l) => (
          <div key={l.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">{l.label}</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">{l.click_count} clicks</span>
            </div>
            <div className="mt-1 select-all break-all rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 font-mono text-[11px] text-indigo-300">
              {shortLink(origin, l.slug)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              → {l.destination} · {[l.source, l.medium, l.campaign].filter(Boolean).join(' / ')}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-500">
        Share the <span className="font-mono">/go/…</span> link everywhere. Each click is logged and forwarded with UTM tags.
        Tying a click to a specific signup (full source attribution) is the next step (Phase 2 — needs signup capture).
      </p>
    </div>
  );
}
