'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  courtStanding,
  computeBadges,
  deriveTitle,
  unlockedDecor,
  type ChambersCounts,
  type DecorStyle,
} from '@/lib/chambers';
import type { ChambersDnaDim } from '@/lib/chambersData';

const STYLE_KEY = 'wv_chambers_style';

export interface ChambersProfileProps {
  name: string;
  username: string | null;
  counts: ChambersCounts;
  mix: { watch: number; maybe: number; skip: number };
  topLove: string | null;
  loves: string[];
  avoids: string[];
  dna: ChambersDnaDim[];
}

function readStyle(): DecorStyle {
  if (typeof window === 'undefined') return 'moderate';
  const v = window.localStorage.getItem(STYLE_KEY);
  return v === 'clean' || v === 'full' ? v : 'moderate';
}

/** A circular progress ring around the avatar — fills with Court Standing. */
function SealRing({ progress, children }: { progress: number; children: React.ReactNode }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(1, progress)) * c;
  return (
    <div className="relative h-28 w-28">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="6" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="#f5c65a" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${dash} ${c}`} />
      </svg>
      <div className="absolute inset-[10px] grid place-items-center overflow-hidden rounded-full">{children}</div>
    </div>
  );
}

function Stat({ value, label, accent = false }: { value: string | number; label: string; accent?: boolean }) {
  return (
    <div className="min-w-0 text-center">
      <div className={`text-xl font-black tabular-nums ${accent ? 'text-gold-400' : 'text-white'}`}>{value}</div>
      <div className="truncate text-[11px] text-slate-400">{label}</div>
    </div>
  );
}

export function ChambersProfile(props: ChambersProfileProps) {
  const { name, username, counts, mix, topLove, loves, avoids, dna } = props;
  const [style, setStyle] = useState<DecorStyle>('moderate');
  useEffect(() => setStyle(readStyle()), []);

  function chooseStyle(s: DecorStyle) {
    setStyle(s);
    try { localStorage.setItem(STYLE_KEY, s); } catch { /* ignore */ }
  }

  const standing = courtStanding(counts);
  const badges = computeBadges(counts);
  const earned = badges.filter((b) => b.earned);
  const locked = badges.filter((b) => !b.earned).sort((a, b) => b.have / b.need - a.have / a.need);
  const title = deriveTitle({
    rated: counts.rated,
    verdicts: counts.verdicts,
    finished: counts.finished,
    reviews: counts.reviews,
    streakWeeks: counts.streakWeeks,
    decades: counts.decades,
    mix,
    topLove,
  });
  const decor = unlockedDecor(counts, style);
  const initial = name.replace('@', '').slice(0, 1).toUpperCase() || '⚖️';

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* ---------------- The seal / chambers header ---------------- */}
      <header
        className="relative overflow-hidden rounded-3xl border border-white/10 px-5 pb-5 pt-7 text-center"
        style={{ background: 'radial-gradient(120% 120% at 50% -10%, #16203a 0%, #0d1120 70%)' }}
      >
        {/* Chambers wall — unlocked evidence, dialled by density. */}
        {decor.length > 0 && (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-wrap items-start justify-between gap-6 p-4 text-3xl opacity-[0.13]">
            {decor.concat(decor).slice(0, 10).map((d, i) => (
              <span key={`${d.key}-${i}`} style={{ transform: `rotate(${((i * 37) % 40) - 20}deg)` }}>{d.emoji}</span>
            ))}
          </div>
        )}

        <div className="relative flex flex-col items-center">
          <SealRing progress={standing.progress}>
            <div className="grid h-full w-full place-items-center bg-gradient-to-br from-brand-500 to-[#7c5cff] text-3xl font-black text-white">
              {initial}
            </div>
          </SealRing>
          <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-gold-400/40 bg-gold-500/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-100">
            {standing.emoji} {standing.name}
          </div>
          <h1 className="mt-2 text-2xl font-black text-white">{name}</h1>
          {username && <div className="text-sm text-slate-400">@{username}</div>}
          <div className="mt-1 text-base font-semibold text-gold-400">
            {title ? `“${title}”` : 'Rate a few titles to earn your courtroom title'}
          </div>
        </div>

        {/* Docket stats — entertainment activity first, social demoted. */}
        <div className="relative mt-5 grid grid-cols-5 gap-2 rounded-2xl border border-white/10 bg-black/20 p-3">
          <Stat value={counts.rated} label="Ruled on" />
          <Stat value={counts.onDocket} label="On docket" />
          <Stat value={counts.verdicts} label="Verdicts" />
          <Stat value={`${counts.streakWeeks}🔥`} label={counts.streakWeeks === 1 ? 'Week' : 'Weeks'} />
          <Stat value={earned.length} label="Badges" accent />
        </div>
      </header>

      {/* ---------------- Court Standing progress ---------------- */}
      <section className="card p-4">
        <div className="flex items-center justify-between">
          <div className="eyebrow-lg">
            ⚖️ Court Standing
          </div>
          <div className="text-xs text-slate-400">{standing.points} pts</div>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gold-400" style={{ width: `${Math.round(standing.progress * 100)}%` }} />
        </div>
        <div className="mt-1.5 text-xs text-slate-400">
          {standing.next
            ? <><span className="font-semibold text-white">{standing.toNext} pts</span> to <span className="font-semibold text-white">{standing.next.name}</span> — earned by rating titles, getting verdicts, and leaving reviews.</>
            : 'You’ve reached the top of the bench. Judge.'}
        </div>
      </section>

      {/* ---------------- Watch DNA ---------------- */}
      <section className="card p-4">
        <div className="eyebrow-lg">
          🧬 Watch DNA
        </div>
        <p className="mt-1 text-xs text-slate-400">Computed only from your own ratings, verdicts and reviews — never guessed.</p>
        {dna.length === 0 && loves.length === 0 && avoids.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Rate titles and answer a few post-watch questions and your DNA fills in here.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {dna.map((d) => (
              <div key={d.key}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-200">{d.label}</span>
                  <span className="font-bold tabular-nums text-white">{d.value}%</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-brand-400" style={{ width: `${d.value}%` }} />
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400">{d.caption}</div>
              </div>
            ))}
            {(loves.length > 0 || avoids.length > 0) && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {loves.map((t) => (
                  <span key={`l-${t}`} className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-100">💚 {t}</span>
                ))}
                {avoids.map((t) => (
                  <span key={`a-${t}`} className="rounded-full border border-red-400/40 bg-red-500/10 px-2.5 py-0.5 text-xs text-red-100">🚫 {t}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ---------------- Badge shelf ---------------- */}
      <section className="card p-4">
        <div className="flex items-center justify-between">
          <div className="eyebrow-lg">
            🏅 The Badge Shelf
          </div>
          <div className="text-xs text-slate-400">{earned.length}/{badges.length} earned</div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {earned.map((b) => (
            <div key={b.key} className="rounded-xl border border-gold-400/40 bg-gold-500/10 p-3">
              <div className="text-2xl">{b.emoji}</div>
              <div className="mt-1 text-sm font-bold text-amber-100">{b.label}</div>
              <div className="text-[11px] text-slate-400">{b.description}</div>
            </div>
          ))}
          {locked.map((b) => (
            <div key={b.key} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-2xl opacity-40 grayscale">{b.emoji}</div>
              <div className="mt-1 text-sm font-semibold text-slate-300">{b.label}</div>
              <div className="text-[11px] text-slate-400">{b.description}</div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-slate-500" style={{ width: `${Math.min(100, Math.round((b.have / b.need) * 100))}%` }} />
              </div>
              <div className="mt-0.5 text-[11px] tabular-nums text-slate-400">{Math.min(b.have, b.need)}/{b.need}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Customize + share ---------------- */}
      <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="label mb-1">Chambers wall</div>
          <div className="flex gap-1.5">
            {(['clean', 'moderate', 'full'] as const).map((s) => (
              <button
                key={s}
                onClick={() => chooseStyle(s)}
                className={`rounded-lg border px-3 py-1.5 text-sm capitalize transition ${style === s ? 'border-gold-400/60 bg-gold-500/15 text-amber-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        {username ? (
          <Link href={`/app/u/${username}`} className="btn-secondary">👁️ View public profile</Link>
        ) : (
          <Link href="/app/settings" className="btn-secondary">Set a username to share →</Link>
        )}
      </section>
    </div>
  );
}
