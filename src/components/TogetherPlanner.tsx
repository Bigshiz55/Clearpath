'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PreferenceTrait } from '@/lib/types';
import { humanTrait } from '@/lib/scoring/traits';

const AVOIDABLE: PreferenceTrait[] = ['supernatural', 'paranormal', 'science_fiction', 'fantasy', 'noir', 'slow_burn'];
const LOVABLE: PreferenceTrait[] = ['grounded_crime', 'psychological_thriller', 'detective_mystery', 'domestic_thriller', 'serial_killer'];
const STORE = 'wv_household';

interface Member {
  id: string;
  name: string;
  avoid: PreferenceTrait[];
  love: PreferenceTrait[];
}

interface PerMember {
  name: string;
  score: number;
  vetoed: boolean;
}
interface Pick {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterUrl: string | null;
  minScore: number;
  avgScore: number;
  anyVeto: boolean;
  tier: string;
  verdict: string;
  perMember: PerMember[];
  streaming: string[];
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `m_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  }
}

function Chip({ label, active, tone, onClick }: { label: string; active: boolean; tone: 'love' | 'avoid'; onClick: () => void }) {
  const on =
    tone === 'love'
      ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100'
      : 'border-red-400/50 bg-red-500/20 text-red-100';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${active ? on : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'}`}
    >
      {label}
    </button>
  );
}

export function TogetherPlanner() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mediaType, setMediaType] = useState<'any' | 'movie' | 'tv'>('any');

  // Editor state
  const [editing, setEditing] = useState<Member | null>(null);

  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      const parsed = raw ? (JSON.parse(raw) as Member[]) : [];
      setMembers(parsed);
      setSelected(new Set(parsed.map((m) => m.id)));
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  function persist(next: Member[]) {
    setMembers(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function startAdd() {
    setEditing({ id: newId(), name: '', avoid: [], love: [] });
  }

  function saveMember(m: Member) {
    if (!m.name.trim()) return;
    const exists = members.some((x) => x.id === m.id);
    const next = exists ? members.map((x) => (x.id === m.id ? m : x)) : [...members, m];
    persist(next);
    setSelected((s) => new Set(s).add(m.id));
    setEditing(null);
  }

  function removeMember(id: string) {
    persist(members.filter((m) => m.id !== id));
    setSelected((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }

  function toggleSelected(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function findPick() {
    const chosen = members.filter((m) => selected.has(m.id));
    if (chosen.length === 0) return;
    setLoading(true);
    setError(null);
    setPicks(null);
    try {
      const res = await fetch('/api/together', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          members: chosen.map((m) => ({ name: m.name, avoid: m.avoid, love: m.love })),
          mediaType,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Could not find a pick.');
      else setPicks(data.picks ?? []);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!loaded) return null;

  // ---- Member editor ----
  if (editing) {
    const e = editing;
    const toggleTrait = (key: 'avoid' | 'love', t: PreferenceTrait) => {
      const has = e[key].includes(t);
      setEditing({ ...e, [key]: has ? e[key].filter((x) => x !== t) : [...e[key], t] });
    };
    return (
      <div className="mt-5 card p-5">
        <label className="label" htmlFor="mname">
          Name
        </label>
        <input
          id="mname"
          value={e.name}
          onChange={(ev) => setEditing({ ...e, name: ev.target.value })}
          placeholder="Scott"
          className="input"
          maxLength={40}
        />
        <div className="mt-4">
          <div className="mb-1.5 text-sm font-semibold text-emerald-200">Loves</div>
          <div className="flex flex-wrap gap-2">
            {LOVABLE.map((t) => (
              <Chip key={t} label={humanTrait(t)} tone="love" active={e.love.includes(t)} onClick={() => toggleTrait('love', t)} />
            ))}
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1.5 text-sm font-semibold text-red-200">Hard no’s (never recommend)</div>
          <div className="flex flex-wrap gap-2">
            {AVOIDABLE.map((t) => (
              <Chip key={t} label={humanTrait(t)} tone="avoid" active={e.avoid.includes(t)} onClick={() => toggleTrait('avoid', t)} />
            ))}
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={() => saveMember(e)} disabled={!e.name.trim()} className="btn-primary">
            Save person
          </button>
          <button onClick={() => setEditing(null)} className="btn-ghost">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5">
      {/* Members */}
      {members.length === 0 ? (
        <div className="card p-6 text-center">
          <div className="text-3xl">👪</div>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">
            Add the people who watch together. Set what each person loves and their hard no’s — then
            get one pick that works for everyone.
          </p>
          <button onClick={startAdd} className="btn-primary mt-4">
            + Add a person
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <label className="flex flex-1 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(m.id)}
                    onChange={() => toggleSelected(m.id)}
                    className="h-5 w-5 accent-brand-500"
                  />
                  <div className="min-w-0">
                    <div className="font-semibold text-white">{m.name}</div>
                    <div className="truncate text-xs text-slate-400">
                      {m.love.length ? `♥ ${m.love.map(humanTrait).join(', ')}` : 'No loves set'}
                      {m.avoid.length ? ` · ✗ ${m.avoid.map(humanTrait).join(', ')}` : ''}
                    </div>
                  </div>
                </label>
                <button onClick={() => setEditing(m)} className="btn-ghost text-xs">
                  Edit
                </button>
                <button onClick={() => removeMember(m.id)} className="btn-ghost text-xs text-red-300 hover:bg-red-500/10">
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button onClick={startAdd} className="btn-secondary mt-3 text-sm">
            + Add a person
          </button>

          {/* Controls */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">Tonight:</span>
            {(['any', 'movie', 'tv'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setMediaType(t)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${mediaType === t ? 'border-brand-400/50 bg-brand-500/20 text-brand-100' : 'border-white/15 bg-white/5 text-slate-300'}`}
              >
                {t === 'any' ? 'Anything' : t === 'movie' ? 'Movies' : 'TV'}
              </button>
            ))}
          </div>

          <button
            onClick={findPick}
            disabled={loading || selected.size === 0}
            className="btn-primary mt-4 w-full py-3 text-base"
          >
            {loading ? 'Finding your pick…' : `🍿 Find our pick (${selected.size} watching)`}
          </button>
        </>
      )}

      {error && (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>
      )}

      {/* Results */}
      {picks && picks.length > 0 && (
        <div className="mt-6 space-y-4">
          {picks.map((p, i) => (
            <div key={`${p.mediaType}-${p.id}`} className={`card overflow-hidden ${i === 0 ? 'border-brand-400/40' : ''}`}>
              <div className="flex gap-4 p-4">
                <Link href={`/app/title/${p.mediaType}/${p.id}`} className="h-36 w-24 flex-shrink-0 overflow-hidden rounded-lg border border-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.posterUrl ? <img src={p.posterUrl} alt="" className="h-full w-full object-cover" /> : null}
                </Link>
                <div className="min-w-0 flex-1">
                  {i === 0 && <div className="text-[11px] font-bold uppercase tracking-wide text-brand-300">Tonight’s pick</div>}
                  <Link href={`/app/title/${p.mediaType}/${p.id}`} className="block">
                    <h3 className="text-lg font-bold text-white">
                      {p.title} {p.year ? <span className="font-normal text-slate-400">({p.year})</span> : null}
                    </h3>
                  </Link>
                  <div
                    className={`mt-1 inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                      p.anyVeto
                        ? 'border-red-400/40 bg-red-500/15 text-red-100'
                        : p.minScore >= 75
                          ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100'
                          : 'border-yellow-400/40 bg-yellow-500/15 text-yellow-100'
                    }`}
                  >
                    {p.verdict}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.perMember.map((pm) => (
                      <span
                        key={pm.name}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          pm.vetoed ? 'bg-red-500/20 text-red-200' : 'bg-white/10 text-slate-200'
                        }`}
                      >
                        {pm.name} {pm.vetoed ? '✗' : pm.score}
                      </span>
                    ))}
                  </div>
                  {p.streaming.length > 0 && (
                    <div className="mt-2 text-xs text-slate-400">
                      <span className="text-slate-300">📺 Streaming:</span> {p.streaming.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          <button onClick={findPick} className="btn-secondary w-full">
            🔁 Show me another set
          </button>
        </div>
      )}
    </div>
  );
}
