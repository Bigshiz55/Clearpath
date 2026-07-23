'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PreferenceTrait } from '@/lib/types';
import { humanTrait } from '@/lib/scoring/traits';
import { TasteCourt } from './TasteCourt';
import { useI18n } from '@/i18n/I18nProvider';

const AVOIDABLE: PreferenceTrait[] = ['supernatural', 'paranormal', 'science_fiction', 'fantasy', 'noir', 'slow_burn'];
const LOVABLE: PreferenceTrait[] = ['grounded_crime', 'psychological_thriller', 'detective_mystery', 'domestic_thriller', 'serial_killer'];
const STORE = 'wv_together_v2';
const LEGACY = 'wv_household';

interface Member {
  id: string;
  name: string;
  avoid: PreferenceTrait[];
  love: PreferenceTrait[];
}

interface GroupDNA {
  nights: number;
  lovedGenres: Record<string, number>;
  lovedTitles: { key: string; title: string }[];
  dislikedKeys: string[];
  compromiser: Record<string, number>;
  surprises: { title: string; who: string }[];
}

interface Group {
  id: string;
  name: string;
  memberIds: string[];
  dna: GroupDNA;
}

interface Store {
  members: Member[];
  groups: Group[];
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
  anyVeto: boolean;
  verdict: string;
  perMember: PerMember[];
  genres: string[];
  dnaMatch: boolean;
  streaming: string[];
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  }
}

function emptyDNA(): GroupDNA {
  return { nights: 0, lovedGenres: {}, lovedTitles: [], dislikedKeys: [], compromiser: {}, surprises: [] };
}

function Chip({ label, active, tone, onClick }: { label: string; active: boolean; tone: 'love' | 'avoid'; onClick: () => void }) {
  const on = tone === 'love' ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100' : 'border-red-400/50 bg-red-500/20 text-red-100';
  return (
    <button type="button" onClick={onClick} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${active ? on : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
      {label}
    </button>
  );
}

export function TogetherPlanner() {
  const { t, plural } = useI18n();
  const [store, setStore] = useState<Store>({ members: [], groups: [] });
  const [loaded, setLoaded] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [guests, setGuests] = useState<Member[]>([]);
  const [mediaType, setMediaType] = useState<'any' | 'movie' | 'tv'>('any');
  const [editing, setEditing] = useState<{ member: Member; isGuest: boolean } | null>(null);
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logged, setLogged] = useState<Set<string>>(new Set());
  const [courtOpen, setCourtOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const parsed = JSON.parse(raw) as Store;
        setStore({ members: parsed.members ?? [], groups: parsed.groups ?? [] });
        setSelected(new Set((parsed.members ?? []).map((m) => m.id)));
      } else {
        const legacy = localStorage.getItem(LEGACY);
        const members = legacy ? (JSON.parse(legacy) as Member[]) : [];
        setStore({ members, groups: [] });
        setSelected(new Set(members.map((m) => m.id)));
      }
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  function persist(next: Store) {
    setStore(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  const activeGroup = store.groups.find((g) => g.id === activeGroupId) ?? null;

  function selectGroup(g: Group) {
    setActiveGroupId(g.id);
    setSelected(new Set(g.memberIds.filter((id) => store.members.some((m) => m.id === id))));
    setGuests([]);
    setPicks(null);
  }

  function clearGroup() {
    setActiveGroupId(null);
  }

  function saveMember(m: Member, isGuest: boolean) {
    if (!m.name.trim()) return;
    if (isGuest) {
      setGuests((g) => [...g, m]);
      setEditing(null);
      return;
    }
    const exists = store.members.some((x) => x.id === m.id);
    const members = exists ? store.members.map((x) => (x.id === m.id ? m : x)) : [...store.members, m];
    persist({ ...store, members });
    setSelected((s) => new Set(s).add(m.id));
    setEditing(null);
  }

  function removeMember(id: string) {
    persist({
      ...store,
      members: store.members.filter((m) => m.id !== id),
      groups: store.groups.map((g) => ({ ...g, memberIds: g.memberIds.filter((x) => x !== id) })),
    });
    setSelected((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }

  function saveGroup() {
    const ids = Array.from(selected);
    if (ids.length < 2) return;
    const names = store.members.filter((m) => ids.includes(m.id)).map((m) => m.name);
    const suggested = names.length <= 2 ? names.join(' & ') : `${names[0]} + ${names.length - 1} others`;
    const name = (typeof window !== 'undefined' ? window.prompt(t('together.namePrompt'), suggested) : suggested) || suggested;
    const group: Group = { id: newId(), name, memberIds: ids, dna: emptyDNA() };
    persist({ ...store, groups: [...store.groups, group] });
    setActiveGroupId(group.id);
  }

  function deleteGroup(id: string) {
    persist({ ...store, groups: store.groups.filter((g) => g.id !== id) });
    if (activeGroupId === id) setActiveGroupId(null);
  }

  function toggleSelected(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setActiveGroupId(null); // ad-hoc once you tweak the selection
  }

  const tonight: Member[] = [...store.members.filter((m) => selected.has(m.id)), ...guests];

  async function findPick() {
    if (tonight.length === 0) return;
    setLoading(true);
    setError(null);
    setPicks(null);
    setLogged(new Set());
    const boostGenres = activeGroup
      ? Object.entries(activeGroup.dna.lovedGenres).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g]) => g)
      : [];
    const excludeKeys = activeGroup ? activeGroup.dna.dislikedKeys : [];
    try {
      const res = await fetch('/api/together', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          members: tonight.map((m) => ({ name: m.name, avoid: m.avoid, love: m.love })),
          mediaType,
          boostGenres,
          excludeKeys,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? t('together.couldNotFindPick'));
      else setPicks(data.picks ?? []);
    } catch {
      setError(t('together.networkError'));
    } finally {
      setLoading(false);
    }
  }

  function logOutcome(p: Pick, outcome: 'loved' | 'fine' | 'nope') {
    const key = `${p.mediaType}-${p.id}`;
    setLogged((s) => new Set(s).add(key));
    if (!activeGroup) return;
    const dna: GroupDNA = JSON.parse(JSON.stringify(activeGroup.dna));
    dna.nights += 1;
    if (outcome === 'loved') {
      for (const g of p.genres) dna.lovedGenres[g] = (dna.lovedGenres[g] ?? 0) + 1;
      if (!dna.lovedTitles.some((t) => t.key === key)) dna.lovedTitles.unshift({ key, title: p.title });
      dna.lovedTitles = dna.lovedTitles.slice(0, 30);
      const eligible = p.perMember.filter((m) => !m.vetoed);
      if (eligible.length > 0) {
        const low = eligible.reduce((a, b) => (b.score < a.score ? b : a));
        dna.compromiser[low.name] = (dna.compromiser[low.name] ?? 0) + 1;
      }
      for (const m of p.perMember) {
        if (m.score < 55) dna.surprises.unshift({ title: p.title, who: m.name });
      }
      dna.surprises = dna.surprises.slice(0, 20);
    } else if (outcome === 'nope') {
      if (!dna.dislikedKeys.includes(key)) dna.dislikedKeys.push(key);
    }
    persist({ ...store, groups: store.groups.map((g) => (g.id === activeGroup.id ? { ...g, dna } : g)) });
  }

  if (!loaded) return null;

  // ---------- Member / guest editor ----------
  if (editing) {
    const { member: e, isGuest } = editing;
    const toggleTrait = (key: 'avoid' | 'love', t: PreferenceTrait) => {
      const has = e[key].includes(t);
      setEditing({ isGuest, member: { ...e, [key]: has ? e[key].filter((x) => x !== t) : [...e[key], t] } });
    };
    return (
      <div className="mt-5 card p-5">
        <div className="mb-2 text-sm font-semibold text-white">
          {isGuest ? t('together.guestCalibration') : e.name ? t('together.editPerson') : t('together.addPerson')}
        </div>
        <input
          value={e.name}
          onChange={(ev) => setEditing({ isGuest, member: { ...e, name: ev.target.value } })}
          placeholder={isGuest ? t('together.guestName') : t('together.name')}
          className="input"
          maxLength={40}
        />
        <div className="mt-4">
          <div className="mb-1.5 text-sm font-semibold text-emerald-200">{t('together.loves')}</div>
          <div className="flex flex-wrap gap-2">
            {LOVABLE.map((t) => (
              <Chip key={t} label={humanTrait(t)} tone="love" active={e.love.includes(t)} onClick={() => toggleTrait('love', t)} />
            ))}
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1.5 text-sm font-semibold text-red-200">{t('together.hardNosNeverRecommend')}</div>
          <div className="flex flex-wrap gap-2">
            {AVOIDABLE.map((t) => (
              <Chip key={t} label={humanTrait(t)} tone="avoid" active={e.avoid.includes(t)} onClick={() => toggleTrait('avoid', t)} />
            ))}
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={() => saveMember(e, isGuest)} disabled={!e.name.trim()} className="btn-primary">
            {isGuest ? t('together.addForTonight') : t('together.savePerson')}
          </button>
          {isGuest && (
            <button onClick={() => saveMember(e, false)} disabled={!e.name.trim()} className="btn-secondary">
              {t('together.savePermanently')}
            </button>
          )}
          <button onClick={() => setEditing(null)} className="btn-ghost">
            {t('together.cancel')}
          </button>
        </div>
      </div>
    );
  }

  if (store.members.length === 0) {
    return (
      <div className="mt-5 card p-6 text-center">
        <div className="text-3xl">👪</div>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">
          {t('together.emptyIntro')}
        </p>
        <button onClick={() => setEditing({ isGuest: false, member: { id: newId(), name: '', avoid: [], love: [] } })} className="btn-primary mt-4">
          {t('together.addPersonBtn')}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-5">
      {/* Saved groups */}
      {store.groups.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('together.yourJuries')}</div>
          <div className="flex flex-wrap gap-2">
            {store.groups.map((g) => (
              <button
                key={g.id}
                onClick={() => (activeGroupId === g.id ? clearGroup() : selectGroup(g))}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${activeGroupId === g.id ? 'border-brand-400/50 bg-brand-500/20 text-brand-100' : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'}`}
                title={plural('together.nightsLogged', g.dna.nights, {})}
              >
                {g.name}
                {g.dna.nights > 0 ? <span className="ml-1 text-[10px] text-slate-400">· {g.dna.nights}</span> : null}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* People */}
      <div className="space-y-2">
        {store.members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <label className="flex flex-1 cursor-pointer items-center gap-3">
              <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleSelected(m.id)} className="h-5 w-5 accent-brand-500" />
              <div className="min-w-0">
                <div className="font-semibold text-white">{m.name}</div>
                <div className="truncate text-xs text-slate-400">
                  {m.love.length ? `♥ ${m.love.map(humanTrait).join(', ')}` : t('together.noLovesSet')}
                  {m.avoid.length ? ` · ✗ ${m.avoid.map(humanTrait).join(', ')}` : ''}
                </div>
              </div>
            </label>
            <button onClick={() => setEditing({ isGuest: false, member: m })} className="btn-ghost text-xs">{t('together.edit')}</button>
            <button onClick={() => removeMember(m.id)} className="btn-ghost text-xs text-red-300 hover:bg-red-500/10">{t('together.remove')}</button>
          </div>
        ))}
        {guests.map((g) => (
          <div key={g.id} className="flex items-center gap-3 rounded-xl border border-brand-400/30 bg-brand-500/10 p-3">
            <div className="flex-1">
              <div className="font-semibold text-white">{g.name} <span className="text-[10px] uppercase text-brand-300">{t('together.guestTag')}</span></div>
              <div className="truncate text-xs text-slate-400">{g.love.length ? `♥ ${g.love.map(humanTrait).join(', ')}` : t('together.guestFallback')}</div>
            </div>
            <button onClick={() => setGuests((gs) => gs.filter((x) => x.id !== g.id))} className="btn-ghost text-xs text-red-300">{t('together.remove')}</button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setEditing({ isGuest: false, member: { id: newId(), name: '', avoid: [], love: [] } })} className="btn-secondary text-sm">
          {t('together.addPersonBtn')}
        </button>
        <button onClick={() => setEditing({ isGuest: true, member: { id: newId(), name: '', avoid: [], love: [] } })} className="btn-ghost text-sm">
          {t('together.addGuest')}
        </button>
        {selected.size >= 2 && !activeGroup && (
          <button onClick={saveGroup} className="btn-ghost text-sm text-brand-200">
            {t('together.saveJuryGroup')}
          </button>
        )}
      </div>

      {/* Group DNA panel */}
      {activeGroup && <GroupDNAPanel group={activeGroup} onDelete={() => deleteGroup(activeGroup.id)} />}

      {/* Controls + go */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">{t('together.tonightLabel')}</span>
          {(['any', 'movie', 'tv'] as const).map((mt) => (
            <button key={mt} onClick={() => setMediaType(mt)} className={`rounded-full border px-3 py-1 text-xs font-medium ${mediaType === mt ? 'border-brand-400/50 bg-brand-500/20 text-brand-100' : 'border-white/15 bg-white/5 text-slate-300'}`}>
              {mt === 'any' ? t('together.anything') : mt === 'movie' ? t('together.movies') : t('together.tv')}
            </button>
          ))}
        </div>
        <button onClick={findPick} disabled={loading || tonight.length === 0} className="btn-primary w-full py-3 text-base">
          {loading ? t('together.findingPick') : plural('together.findOurPick', tonight.length, {})}
        </button>
        <button onClick={() => setCourtOpen(true)} disabled={tonight.length < 2} className="btn-secondary mt-2 w-full">
          ⚖️ {t('together.hold90Court')}
        </button>
      </div>

      {courtOpen && (
        <TasteCourt
          members={tonight.map((m) => ({ name: m.name, love: m.love, avoid: m.avoid }))}
          mediaType={mediaType}
          boostGenres={activeGroup ? Object.entries(activeGroup.dna.lovedGenres).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g]) => g) : []}
          excludeKeys={activeGroup ? activeGroup.dna.dislikedKeys : []}
          onClose={() => setCourtOpen(false)}
          onWinnerLogged={
            activeGroup
              ? (f, outcome) =>
                  logOutcome(
                    { id: f.id, mediaType: f.mediaType, title: f.title, year: f.year, posterUrl: f.posterUrl, minScore: f.minScore, anyVeto: false, verdict: '', perMember: f.perMember, genres: f.genres, dnaMatch: false, streaming: f.streaming },
                    outcome,
                  )
              : undefined
          }
        />
      )}

      {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}

      {/* Results */}
      {picks && picks.length > 0 && (
        <div className="space-y-4">
          {picks.map((p, i) => {
            const key = `${p.mediaType}-${p.id}`;
            const isLogged = logged.has(key);
            return (
              <div key={key} className={`card overflow-hidden ${i === 0 ? 'border-brand-400/40' : ''}`}>
                <div className="flex gap-4 p-4">
                  <Link href={`/app/title/${p.mediaType}/${p.id}`} className="h-36 w-24 flex-shrink-0 overflow-hidden rounded-lg border border-white/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p.posterUrl ? <img src={p.posterUrl} alt="" className="h-full w-full object-cover" /> : null}
                  </Link>
                  <div className="min-w-0 flex-1">
                    {i === 0 && <div className="text-[11px] font-bold uppercase tracking-wide text-brand-300">{t('together.tonightsPick')}</div>}
                    <Link href={`/app/title/${p.mediaType}/${p.id}`} className="block">
                      <h3 className="text-lg font-bold text-white">{p.title} {p.year ? <span className="font-normal text-slate-400">({p.year})</span> : null}</h3>
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${p.anyVeto ? 'border-red-400/40 bg-red-500/15 text-red-100' : p.minScore >= 75 ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100' : 'border-yellow-400/40 bg-yellow-500/15 text-yellow-100'}`}>{p.verdict}</span>
                      {p.dnaMatch && <span className="rounded-full border border-brand-400/40 bg-brand-500/15 px-2 py-0.5 text-[10px] font-bold text-brand-100">🧬 {t('together.yourKindOfThing')}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.perMember.map((pm) => (
                        <span key={pm.name} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${pm.vetoed ? 'bg-red-500/20 text-red-200' : 'bg-white/10 text-slate-200'}`}>
                          {pm.name} {pm.vetoed ? '✗' : pm.score}
                        </span>
                      ))}
                    </div>
                    {p.streaming.length > 0 && <div className="mt-2 text-xs text-slate-400"><span className="text-slate-300">📺</span> {p.streaming.join(', ')}</div>}
                  </div>
                </div>
                {i === 0 && (
                  <div className="border-t border-white/10 px-4 py-3">
                    {isLogged ? (
                      <div className="text-xs text-slate-400">{activeGroup ? t('together.loggedToGroup', { name: activeGroup.name }) : t('together.loggedNoJury')}</div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">{t('together.watchedHowdItGo')}</span>
                        <button onClick={() => logOutcome(p, 'loved')} className="rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-100">👍 {t('together.loved')}</button>
                        <button onClick={() => logOutcome(p, 'fine')} className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-200">😐 {t('together.fine')}</button>
                        <button onClick={() => logOutcome(p, 'nope')} className="rounded-lg border border-red-400/40 bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-100">👎 {t('together.nope')}</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <button onClick={findPick} className="btn-secondary w-full">🔁 {t('together.showAnotherSet')}</button>
        </div>
      )}
    </div>
  );
}

function GroupDNAPanel({ group, onDelete }: { group: Group; onDelete: () => void }) {
  const { t, plural } = useI18n();
  const { dna } = group;
  const topGenres = Object.entries(dna.lovedGenres).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const compromiser =
    dna.nights >= 3 && Object.keys(dna.compromiser).length > 0
      ? Object.entries(dna.compromiser).sort((a, b) => b[1] - a[1])[0]![0]
      : null;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-white">🧬 {t('together.groupDna', { name: group.name })}</div>
        <button onClick={onDelete} className="text-[11px] text-slate-500 hover:text-red-300">{t('together.deleteJury')}</button>
      </div>
      {dna.nights === 0 ? (
        <p className="mt-2 text-xs text-slate-400">{t('together.groupDnaEmpty')}</p>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          <div className="text-xs text-slate-400">{plural('together.nightsLoggedTogether', dna.nights, {})}</div>
          {topGenres.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-300">{t('together.genresClick')}</div>
              <div className="flex flex-wrap gap-1.5">
                {topGenres.map(([g, n]) => (
                  <span key={g} className="rounded-full bg-brand-500/15 px-2.5 py-0.5 text-xs text-brand-100">{g}{n > 1 ? ` ×${n}` : ''}</span>
                ))}
              </div>
            </div>
          )}
          {dna.lovedTitles.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-300">{t('together.lovedTogether')}</div>
              <div className="text-xs text-slate-300">{dna.lovedTitles.slice(0, 8).map((lt) => lt.title).join(' · ')}</div>
            </div>
          )}
          {compromiser && <div className="text-xs text-slate-400">{t('together.usualCompromiser')} <span className="text-slate-200">{compromiser}</span></div>}
          {dna.surprises.length > 0 && (
            <div className="text-xs text-slate-400">
              {t('together.surpriseHits')} <span className="text-slate-200">{Array.from(new Set(dna.surprises.map((s) => s.title))).slice(0, 4).join(', ')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
