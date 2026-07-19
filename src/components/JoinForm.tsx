'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PreferenceTrait } from '@/lib/types';
import { humanTrait } from '@/lib/scoring/traits';
import { joinCrew } from '@/lib/actions/crews';
import { getMyTaste, type MyTaste } from '@/lib/actions/profile';

const AVOIDABLE: PreferenceTrait[] = ['supernatural', 'paranormal', 'science_fiction', 'fantasy', 'noir', 'slow_burn'];
const LOVABLE: PreferenceTrait[] = ['grounded_crime', 'psychological_thriller', 'detective_mystery', 'domestic_thriller', 'serial_killer'];

function Chip({ label, active, tone, onClick }: { label: string; active: boolean; tone: 'love' | 'avoid'; onClick: () => void }) {
  const on = tone === 'love' ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100' : 'border-red-400/50 bg-red-500/20 text-red-100';
  return (
    <button type="button" onClick={onClick} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${active ? on : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
      {label}
    </button>
  );
}

export function JoinForm({ code, crewName }: { code: string; crewName: string }) {
  const [name, setName] = useState('');
  const [love, setLove] = useState<PreferenceTrait[]>([]);
  const [avoid, setAvoid] = useState<PreferenceTrait[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [mine, setMine] = useState<MyTaste | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    getMyTaste().then(setMine).catch(() => {});
  }, []);

  function useMyTaste() {
    if (!mine) return;
    if (mine.name) setName(mine.name);
    setLove(mine.love as PreferenceTrait[]);
    setAvoid(mine.avoid as PreferenceTrait[]);
    setPrefilled(true);
  }

  function toggle(list: PreferenceTrait[], set: (v: PreferenceTrait[]) => void, t: PreferenceTrait) {
    set(list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);
  }

  async function submit() {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    const res = await joinCrew({ code, name, love, avoid });
    setLoading(false);
    if (res.ok) setDone(true);
    else setError(res.error ?? 'Could not join.');
  }

  if (done) {
    return (
      <div className="card p-8 text-center">
        <div className="text-4xl">🎉</div>
        <h1 className="mt-3 text-xl font-bold text-white">You’re in!</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">
          {crewName} can now include your taste on movie night. Hand the phone back — you’re all set.
        </p>
        <Link href="/app" className="btn-secondary mt-6 inline-flex">
          Explore WatchVrdIQt →
        </Link>
      </div>
    );
  }

  return (
    <div className="card p-5">
      {mine?.signedIn && !prefilled && (mine.name || mine.love.length > 0 || mine.avoid.length > 0) && (
        <button onClick={useMyTaste} className="mb-3 w-full rounded-xl border border-brand-400/40 bg-brand-500/15 px-3 py-2 text-sm font-semibold text-brand-100">
          ✨ Use my WatchVrdIQt taste{mine.name ? ` (${mine.name})` : ''}
        </button>
      )}
      <label className="label" htmlFor="jn">Your name</label>
      <input id="jn" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" className="input" maxLength={40} />

      <div className="mt-4">
        <div className="mb-1.5 text-sm font-semibold text-emerald-200">What do you love?</div>
        <div className="flex flex-wrap gap-2">
          {LOVABLE.map((t) => (
            <Chip key={t} label={humanTrait(t)} tone="love" active={love.includes(t)} onClick={() => toggle(love, setLove, t)} />
          ))}
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-1.5 text-sm font-semibold text-red-200">Any hard no’s?</div>
        <div className="flex flex-wrap gap-2">
          {AVOIDABLE.map((t) => (
            <Chip key={t} label={humanTrait(t)} tone="avoid" active={avoid.includes(t)} onClick={() => toggle(avoid, setAvoid, t)} />
          ))}
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-sm text-red-200">{error}</p>}

      <button onClick={submit} disabled={loading || !name.trim()} className="btn-primary mt-5 w-full py-3">
        {loading ? 'Joining…' : `Join ${crewName}`}
      </button>
    </div>
  );
}
