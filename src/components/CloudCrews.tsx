'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/i18n/I18nProvider';
import type { PreferenceTrait } from '@/lib/types';
import { humanTrait } from '@/lib/scoring/traits';
import {
  listCrews,
  createCrew,
  deleteCrew,
  addCrewPerson,
  removeCrewPerson,
  logCrewOutcome,
  getCrewInvite,
  type Crew,
} from '@/lib/actions/crews';
import { TasteCourt } from './TasteCourt';

const AVOIDABLE: PreferenceTrait[] = ['supernatural', 'paranormal', 'science_fiction', 'fantasy', 'noir', 'slow_burn'];
const LOVABLE: PreferenceTrait[] = ['grounded_crime', 'psychological_thriller', 'detective_mystery', 'domestic_thriller', 'serial_killer'];

interface PerMember { name: string; score: number; vetoed: boolean }
interface Pick {
  id: number; mediaType: 'movie' | 'tv'; title: string; year: number | null; posterUrl: string | null;
  minScore: number; anyVeto: boolean; verdict: string; perMember: PerMember[]; genres: string[]; dnaMatch: boolean; streaming: string[];
}

function Chip({ label, active, tone, onClick }: { label: string; active: boolean; tone: 'love' | 'avoid'; onClick: () => void }) {
  const on = tone === 'love' ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100' : 'border-red-400/50 bg-red-500/20 text-red-100';
  return <button type="button" onClick={onClick} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${active ? on : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'}`}>{label}</button>;
}

export function CloudCrews() {
  const { t, plural } = useI18n();
  const [crews, setCrews] = useState<Crew[] | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Add-person editor
  const [adding, setAdding] = useState(false);
  const [pName, setPName] = useState('');
  const [pLove, setPLove] = useState<PreferenceTrait[]>([]);
  const [pAvoid, setPAvoid] = useState<PreferenceTrait[]>([]);

  // Invite modal
  const [invite, setInvite] = useState<{ url: string; qrSvg: string } | null>(null);
  const [courtOpen, setCourtOpen] = useState(false);

  // Pick
  const [mediaType, setMediaType] = useState<'any' | 'movie' | 'tv'>('any');
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [logged, setLogged] = useState<Set<string>>(new Set());

  async function reload() {
    const res = await listCrews();
    if (res.needsSetup) { setNeedsSetup(true); setCrews([]); return; }
    if (!res.ok) { setErr(res.error ?? t('together.crews.loadFailed')); setCrews([]); return; }
    setNeedsSetup(false);
    setCrews(res.crews ?? []);
    if (selId && !(res.crews ?? []).some((c) => c.id === selId)) setSelId(null);
  }

  useEffect(() => { void reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = crews?.find((c) => c.id === selId) ?? null;

  async function onCreate() {
    const name = window.prompt(t('together.crews.namePrompt'));
    if (!name?.trim()) return;
    setBusy(true);
    const res = await createCrew(name.trim());
    setBusy(false);
    if (res.needsSetup) setNeedsSetup(true);
    else if (!res.ok) setErr(res.error ?? t('together.crews.failed'));
    else await reload();
  }

  async function onAddPerson() {
    if (!selected || !pName.trim()) return;
    setBusy(true);
    const res = await addCrewPerson({ crewId: selected.id, name: pName.trim(), love: pLove, avoid: pAvoid });
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? t('together.crews.failed')); return; }
    setPName(''); setPLove([]); setPAvoid([]); setAdding(false);
    await reload();
  }

  async function onInvite() {
    if (!selected) return;
    setBusy(true);
    const res = await getCrewInvite(selected.id, window.location.origin);
    setBusy(false);
    if (res.ok && res.url && res.qrSvg) setInvite({ url: res.url, qrSvg: res.qrSvg });
    else setErr(res.error ?? t('together.crews.inviteFailed'));
  }

  async function findPick() {
    if (!selected || selected.people.length === 0) return;
    setPicking(true); setPicks(null); setLogged(new Set());
    const boostGenres = Object.entries(selected.dna.lovedGenres).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g]) => g);
    try {
      const res = await fetch('/api/together', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          members: selected.people.map((p) => ({ name: p.name, avoid: p.avoid, love: p.love })),
          mediaType, boostGenres, excludeKeys: selected.dna.dislikedKeys,
        }),
      });
      const data = await res.json();
      if (!res.ok) setErr(data.error ?? t('together.crews.pickFailed'));
      else setPicks(data.picks ?? []);
    } catch { setErr(t('together.crews.networkError')); }
    finally { setPicking(false); }
  }

  async function onLog(p: Pick, outcome: 'loved' | 'fine' | 'nope') {
    if (!selected) return;
    setLogged((s) => new Set(s).add(`${p.mediaType}-${p.id}`));
    await logCrewOutcome({
      crewId: selected.id, key: `${p.mediaType}-${p.id}`, title: p.title, genres: p.genres,
      perMember: p.perMember, outcome,
    });
    await reload();
  }

  if (crews === null) {
    return <div className="mt-3 text-sm text-slate-400">{t('together.crews.loading')}</div>;
  }

  if (needsSetup) {
    return (
      <div className="card p-4">
        <div className="text-sm font-semibold text-white">{t('together.crews.setupTitle')}</div>
        <p className="mt-1 text-xs text-slate-400">
          {t('together.crews.setupBody1')}<code className="text-slate-300">supabase/migrations/0003_crews.sql</code>{t('together.crews.setupBody2')}
        </p>
        <a
          href="https://supabase.com/dashboard/project/vajgviraxigkwlvysxfz/sql/new"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary mt-3 inline-flex text-sm"
        >
          {t('together.crews.openSqlEditor')}
        </a>
      </div>
    );
  }

  const toggle = (list: PreferenceTrait[], set: (v: PreferenceTrait[]) => void, trait: PreferenceTrait) =>
    set(list.includes(trait) ? list.filter((x) => x !== trait) : [...list, trait]);

  return (
    <div className="space-y-4">
      {err && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-sm text-red-200">{err}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {crews.map((c) => (
          <button key={c.id} onClick={() => { setSelId(c.id === selId ? null : c.id); setPicks(null); }}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${selId === c.id ? 'border-brand-400/50 bg-brand-500/20 text-brand-100' : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'}`}>
            {c.name}{c.dna.nights > 0 ? <span className="ml-1 text-[10px] text-slate-400">· {c.dna.nights}</span> : null}
          </button>
        ))}
        <button onClick={onCreate} disabled={busy} className="btn-secondary text-sm">{t('together.crews.newJury')}</button>
      </div>

      {selected && (
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div className="font-bold text-white">🧬 {selected.name}</div>
            <div className="flex gap-2">
              <button onClick={onInvite} disabled={busy} className="rounded-lg border border-brand-400/40 bg-brand-500/15 px-2.5 py-1 text-xs font-semibold text-brand-100">{t('together.crews.invite')}</button>
              <button onClick={async () => { if (confirm(t('together.crews.deleteConfirm'))) { await deleteCrew(selected.id); await reload(); } }} className="text-[11px] text-slate-500 hover:text-red-300">{t('together.crews.delete')}</button>
            </div>
          </div>

          {/* People */}
          <div className="mt-3 space-y-1.5">
            {selected.people.length === 0 && <div className="text-xs text-slate-400">{t('together.crews.noPeople')}</div>}
            {selected.people.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-white">{p.name}</span>
                  {p.isGuest && <span className="ml-1 text-[10px] uppercase text-brand-300">{t('together.crews.guest')}</span>}
                  <span className="ml-2 truncate text-xs text-slate-400">
                    {p.love.length ? `♥ ${p.love.map((tr) => humanTrait(tr as PreferenceTrait)).join(', ')}` : ''}
                    {p.avoid.length ? ` · ✗ ${p.avoid.map((tr) => humanTrait(tr as PreferenceTrait)).join(', ')}` : ''}
                  </span>
                </div>
                <button onClick={async () => { await removeCrewPerson(p.id); await reload(); }} className="text-[11px] text-slate-500 hover:text-red-300">{t('together.crews.remove')}</button>
              </div>
            ))}
          </div>

          {adding ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <input value={pName} onChange={(e) => setPName(e.target.value)} placeholder={t('together.crews.namePlaceholder')} className="input" maxLength={40} />
              <div className="mt-2 text-xs font-semibold text-emerald-200">{t('together.crews.loves')}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">{LOVABLE.map((tr) => <Chip key={tr} label={humanTrait(tr)} tone="love" active={pLove.includes(tr)} onClick={() => toggle(pLove, setPLove, tr)} />)}</div>
              <div className="mt-2 text-xs font-semibold text-red-200">{t('together.crews.hardNos')}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">{AVOIDABLE.map((tr) => <Chip key={tr} label={humanTrait(tr)} tone="avoid" active={pAvoid.includes(tr)} onClick={() => toggle(pAvoid, setPAvoid, tr)} />)}</div>
              <div className="mt-3 flex gap-2">
                <button onClick={onAddPerson} disabled={busy || !pName.trim()} className="btn-primary text-sm">{t('together.crews.add')}</button>
                <button onClick={() => setAdding(false)} className="btn-ghost text-sm">{t('together.crews.cancel')}</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className="btn-ghost mt-2 text-sm">{t('together.crews.addPerson')}</button>
          )}

          {/* DNA */}
          {selected.dna.nights > 0 && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
              <div className="text-xs text-slate-400">{plural('together.crews.nightsLogged', selected.dna.nights)}</div>
              {Object.keys(selected.dna.lovedGenres).length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {Object.entries(selected.dna.lovedGenres).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([g, n]) => (
                    <span key={g} className="rounded-full bg-brand-500/15 px-2.5 py-0.5 text-xs text-brand-100">{g}{n > 1 ? ` ×${n}` : ''}</span>
                  ))}
                </div>
              )}
              {selected.dna.lovedTitles.length > 0 && <div className="mt-2 text-xs text-slate-300">{t('together.crews.lovedTogether', { titles: selected.dna.lovedTitles.slice(0, 6).map((lt) => lt.title).join(' · ') })}</div>}
            </div>
          )}

          {/* Pick */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {(['any', 'movie', 'tv'] as const).map((m) => (
              <button key={m} onClick={() => setMediaType(m)} className={`rounded-full border px-3 py-1 text-xs font-medium ${mediaType === m ? 'border-brand-400/50 bg-brand-500/20 text-brand-100' : 'border-white/15 bg-white/5 text-slate-300'}`}>
                {m === 'any' ? t('together.crews.anything') : m === 'movie' ? t('together.crews.movies') : t('together.crews.tv')}
              </button>
            ))}
          </div>
          <button onClick={findPick} disabled={picking || selected.people.length === 0} className="btn-primary mt-3 w-full py-3">
            {picking ? t('together.crews.finding') : t('together.crews.findPick', { count: selected.people.length })}
          </button>
          <button onClick={() => setCourtOpen(true)} disabled={selected.people.length < 2} className="btn-secondary mt-2 w-full">
            {t('together.crews.tasteCourt')}
          </button>

          {picks && picks.length > 0 && (
            <div className="mt-4 space-y-3">
              {picks.map((p, i) => {
                const key = `${p.mediaType}-${p.id}`;
                return (
                  <div key={key} className={`rounded-xl border ${i === 0 ? 'border-brand-400/40' : 'border-white/10'} bg-white/[0.03] p-3`}>
                    <div className="flex gap-3">
                      <Link href={`/app/title/${p.mediaType}/${p.id}`} className="h-28 w-20 flex-shrink-0 overflow-hidden rounded-lg border border-white/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {p.posterUrl ? <img src={p.posterUrl} alt="" className="h-full w-full object-cover" /> : null}
                      </Link>
                      <div className="min-w-0 flex-1">
                        {i === 0 && <div className="text-[11px] font-bold uppercase text-brand-300">{t('together.crews.tonightsPick')}</div>}
                        <Link href={`/app/title/${p.mediaType}/${p.id}`}><h4 className="font-bold text-white">{p.title} {p.year ? <span className="font-normal text-slate-400">({p.year})</span> : null}</h4></Link>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${p.anyVeto ? 'border-red-400/40 bg-red-500/15 text-red-100' : p.minScore >= 75 ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100' : 'border-yellow-400/40 bg-yellow-500/15 text-yellow-100'}`}>{p.verdict}</span>
                          {p.dnaMatch && <span className="rounded-full border border-brand-400/40 bg-brand-500/15 px-2 py-0.5 text-[10px] font-bold text-brand-100">🧬</span>}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {p.perMember.map((pm) => <span key={pm.name} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${pm.vetoed ? 'bg-red-500/20 text-red-200' : 'bg-white/10 text-slate-200'}`}>{pm.name} {pm.vetoed ? '✗' : pm.score}</span>)}
                        </div>
                        {p.streaming.length > 0 && <div className="mt-1 text-[11px] text-slate-400">📺 {p.streaming.join(', ')}</div>}
                      </div>
                    </div>
                    {i === 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        {logged.has(key) ? <span className="text-[11px] text-slate-400">{t('together.crews.logged', { name: selected.name })}</span> : (
                          <>
                            <span className="text-[11px] text-slate-400">{t('together.crews.howdItGo')}</span>
                            <button onClick={() => onLog(p, 'loved')} className="rounded border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-100">👍</button>
                            <button onClick={() => onLog(p, 'fine')} className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-slate-200">😐</button>
                            <button onClick={() => onLog(p, 'nope')} className="rounded border border-red-400/40 bg-red-500/15 px-2 py-0.5 text-[11px] text-red-100">👎</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {courtOpen && selected && (
        <TasteCourt
          members={selected.people.map((p) => ({ name: p.name, love: p.love, avoid: p.avoid }))}
          mediaType={mediaType}
          boostGenres={Object.entries(selected.dna.lovedGenres).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g]) => g)}
          excludeKeys={selected.dna.dislikedKeys}
          onClose={() => setCourtOpen(false)}
          onWinnerLogged={async (f, outcome) => {
            await logCrewOutcome({ crewId: selected.id, key: `${f.mediaType}-${f.id}`, title: f.title, genres: f.genres, perMember: f.perMember, outcome });
            await reload();
          }}
        />
      )}

      {/* Invite modal */}
      {invite && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setInvite(null)}>
          <div className="card max-w-sm p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-bold text-white">{t('together.crews.scanToJoin')}</div>
            <div className="mx-auto mt-3 h-56 w-56 rounded-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: invite.qrSvg }} />
            <p className="mt-3 break-all text-xs text-slate-400">{invite.url}</p>
            <div className="mt-4 flex justify-center gap-2">
              <button onClick={() => navigator.clipboard?.writeText(invite.url)} className="btn-secondary text-sm">{t('together.crews.copyLink')}</button>
              <button onClick={() => setInvite(null)} className="btn-ghost text-sm">{t('together.crews.close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
