import { createClient } from '@/lib/supabase/server';
import { addProspect } from '@/lib/actions/growth';

export const dynamic = 'force-dynamic';

interface Prospect {
  id: string; name: string; category: string | null; platform: string | null;
  audience_size: number | null; status: string; next_follow_up: string | null; contact: string | null; notes: string | null;
}

export default async function CrmPage({ searchParams }: { searchParams: { filter?: string } }) {
  const supabase = createClient();
  let rows: Prospect[] = [];
  let ready = true;
  try {
    let q = supabase.from('growth_prospects').select('id,name,category,platform,audience_size,status,next_follow_up,contact,notes').order('created_at', { ascending: false }).limit(200);
    if (searchParams.filter === 'followup') q = supabase.from('growth_prospects').select('id,name,category,platform,audience_size,status,next_follow_up,contact,notes').not('next_follow_up', 'is', null).lte('next_follow_up', new Date().toISOString().slice(0, 10)).order('next_follow_up');
    const { data, error } = await q;
    if (error) ready = false; else rows = (data ?? []) as Prospect[];
  } catch { ready = false; }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-black text-white">Prospects</h1>
        <p className="text-sm text-slate-400">Everyone you plan to reach — creators, communities, newsletters, friends, partners.</p>
      </header>

      {!ready && <SetupNote />}

      <form action={addProspect} className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <Input name="name" placeholder="Name / community" required className="col-span-2" />
        <select name="category" className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-white">
          {['community', 'creator', 'newsletter', 'podcast', 'blogger', 'friend', 'partner', 'other'].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <Input name="platform" placeholder="Platform (Reddit, TikTok…)" />
        <Input name="audience_size" type="number" placeholder="Audience size" />
        <Input name="contact" placeholder="Contact (@handle / email)" />
        <Input name="next_follow_up" type="date" placeholder="Follow-up date" className="col-span-2" />
        <Input name="notes" placeholder="Why relevant / notes" className="col-span-2" />
        <button className="col-span-2 rounded-lg bg-indigo-500 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-400">Add prospect</button>
      </form>

      <div className="space-y-2">
        {rows.length === 0 && ready && <p className="text-sm text-slate-500">No prospects yet — add your first 10 above. (Sources are in Today’s Plan.)</p>}
        {rows.map((p) => (
          <div key={p.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">{p.name}</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">{p.status}</span>
            </div>
            <div className="mt-0.5 text-xs text-slate-400">
              {[p.category, p.platform, p.audience_size ? `${p.audience_size.toLocaleString()} audience` : null, p.contact, p.next_follow_up ? `follow up ${p.next_follow_up}` : null].filter(Boolean).join(' · ')}
            </div>
            {p.notes && <div className="mt-1 text-xs text-slate-500">{p.notes}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  const { className = '', ...rest } = props;
  return <input {...rest} className={`rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-white placeholder:text-slate-500 ${className}`} />;
}
export function SetupNote() {
  return (
    <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-200">
      Apply migration <code>0039_growth_os</code> at <a href="/migrate" className="underline">/migrate</a> to enable saving. Forms below won’t persist until then.
    </div>
  );
}
