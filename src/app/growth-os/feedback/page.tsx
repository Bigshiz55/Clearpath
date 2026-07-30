import { createClient } from '@/lib/supabase/server';
import { recordFeedback } from '@/lib/actions/growth';
import { SetupNote } from '@/app/growth-os/crm/page';

export const dynamic = 'force-dynamic';

interface Row {
  id: string; subject: string | null; source: string | null; activation: string | null;
  first_impression: string | null; confusion: string | null; favorite: string | null;
  missing: string | null; quote: string | null; created_at: string;
}

export default async function FeedbackPage() {
  const supabase = createClient();
  let rows: Row[] = [];
  let ready = true;
  try {
    const { data, error } = await supabase.from('growth_feedback').select('id,subject,source,activation,first_impression,confusion,favorite,missing,quote,created_at').order('created_at', { ascending: false }).limit(100);
    if (error) ready = false; else rows = (data ?? []) as Row[];
  } catch { ready = false; }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-black text-white">Early-user feedback</h1>
        <p className="text-sm text-slate-400">Below 100 users, one honest conversation beats any dashboard. Log every one.</p>
      </header>

      {!ready && <SetupNote />}

      <details className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
        <summary className="cursor-pointer font-semibold text-white">Quick interview guides</summary>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-slate-400">
          <li><b>Brand-new user:</b> What did you expect? What was confusing in the first 60 seconds? Would you use this again — why / why not?</li>
          <li><b>Abandoned onboarding:</b> Where did you stop? What felt like too much? What would’ve kept you going?</li>
          <li><b>DNA done, didn’t return:</b> What would bring you back? Did the picks feel like you?</li>
          <li><b>Active user:</b> What’s the one thing you’d hate to lose? Who else needs this?</li>
          <li><b>Inviter:</b> What made you invite someone? What did you tell them it was?</li>
        </ul>
      </details>

      <form action={recordFeedback} className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <input name="subject" placeholder="Who (name / handle)" className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-white placeholder:text-slate-500" />
        <input name="source" placeholder="Acquisition source" className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-white placeholder:text-slate-500" />
        <input name="favorite" placeholder="Favorite thing" className="col-span-2 rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-white placeholder:text-slate-500" />
        <input name="confusion" placeholder="Biggest confusion" className="col-span-2 rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-white placeholder:text-slate-500" />
        <input name="missing" placeholder="What’s missing" className="col-span-2 rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-white placeholder:text-slate-500" />
        <textarea name="quote" placeholder="Direct quote" rows={2} className="col-span-2 rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-white placeholder:text-slate-500" />
        <button className="col-span-2 rounded-lg bg-indigo-500 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-400">Save feedback</button>
      </form>

      <div className="space-y-2">
        {rows.length === 0 && ready && <p className="text-sm text-slate-500">No feedback yet — run 3 five-minute interviews this week.</p>}
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">{r.subject || 'Anonymous'}</span>
              <span className="text-[11px] text-slate-500">{r.source || ''}</span>
            </div>
            {r.quote && <p className="mt-1 italic text-slate-300">“{r.quote}”</p>}
            <div className="mt-1 text-xs text-slate-400">
              {[r.favorite && `❤ ${r.favorite}`, r.confusion && `😕 ${r.confusion}`, r.missing && `➕ ${r.missing}`].filter(Boolean).join(' · ')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
