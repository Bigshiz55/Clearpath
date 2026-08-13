'use client';

import { useState } from 'react';
import { ShadowRoom } from '@/components/court/ShadowRoom';
import { CrewRail } from '@/components/court/CrewRail';
import { CloudCrews } from '@/components/CloudCrews';
import { TogetherPlanner } from '@/components/TogetherPlanner';
import { useStartCourt } from '@/lib/court/useStartCourt';

/**
 * THE ENTRANCE TO THE VERDICT ROOM.
 *
 * ── WHAT THIS REPLACES ────────────────────────────────────────────────────
 * A 576px column holding a heading, a plain blue rectangle, two identical
 * cards and an underlined "Manage your saved Crews" — floating at the top of
 * an otherwise black screen. It read as a launcher for a feature, not as one
 * of the product's signature experiences, and it said nothing at all about
 * what happens after you press the button.
 *
 * ── THE IDEA ──────────────────────────────────────────────────────────────
 * You are standing at the door of a room that is already running. The
 * controls are in front of you; the room is behind them, out of focus and
 * twenty feet back. `ShadowRoom` is that room, built from what `CourtRoom`
 * and `VotingFloor` genuinely render — not a stock illustration and not a
 * screenshot pasted behind glass. The whole screen is the composition.
 *
 * ── WHAT DID NOT CHANGE ───────────────────────────────────────────────────
 * Every behaviour is the one that shipped. `useStartCourt` still creates the
 * room (same RPC, same host token, same redirect); "Invite the Jury" still
 * opens that same room rather than a second implementation of it; "Quick
 * Pick" still discloses `TogetherPlanner` in place; crews still open
 * `CloudCrews`. The test ids the mobile suite drives — `start-court`,
 * `open-device`, `open-invite`, `open-crews`, `together-secondary` — are all
 * preserved. This is an experiential redesign, not a rewrite of the room.
 */
type Panel = 'device' | 'crews' | null;

export function VerdictRoomEntrance() {
  const [open, setOpen] = useState<Panel>(null);
  const { start, loading, error } = useStartCourt();

  return (
    <div data-testid="verdict-room-entrance">
      {/* THE STAGE, EDGE TO EDGE. The shell caps content at max-w-7xl, which is
          right for a grid of cards and wrong for a room: at 1440 it left a hard
          black band down both sides and the composition read as a large card
          rather than a screen. This breaks the cap deliberately — and only
          here — by centring a viewport-wide box on the shell's own centre. The
          foreground below re-applies a readable measure, so only the ATMOSPHERE
          gets the extra width. */}
      <section
        aria-labelledby="verdict-room-title"
        className="relative left-1/2 isolate -mb-6 -mt-6 flex w-screen min-h-[calc(100dvh-4.5rem)] -translate-x-1/2 flex-col overflow-hidden"
      >
        <ShadowRoom />

        {/* FOREGROUND. A single column on a phone; identity + controls left,
            crews right from `lg`, so the middle of the stage stays visible
            between them rather than being covered by a centred card. */}
        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col justify-end px-4 pb-8 pt-10 sm:px-6 sm:pb-10 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)] lg:items-end lg:gap-10 lg:px-10 lg:pb-14 2xl:max-w-[1520px]">
          <div className="max-w-xl">
            <p
              className="wv-vr-enter text-[11px] font-black uppercase tracking-[0.28em] text-brand-200/80"
              style={{ '--wv-vr-step': 0 } as React.CSSProperties}
            >
              WatchVerd1ct
            </p>
            <h1
              id="verdict-room-title"
              className="wv-vr-enter mt-2 text-[clamp(2.4rem,7vw,4.5rem)] font-black leading-[0.95] tracking-[-0.02em] text-white"
              style={{ '--wv-vr-step': 1 } as React.CSSProperties}
            >
              The Verdict
              <br />
              Room
            </h1>
            <p
              className="wv-vr-enter mt-4 max-w-md text-base leading-relaxed text-slate-300 sm:text-lg"
              style={{ '--wv-vr-step': 2 } as React.CSSProperties}
            >
              Everyone weighs in. One title wins.
            </p>

            {/* A PHONE HAS NO GUTTERS, SO IT GETS A BAND. On a wide screen the
                room shows either side of this column; at 390 the column IS the
                screen, so the layout opens a deliberate gap here and the stage
                shows through it. Without this the shadow room is present and
                invisible, which is the same as not having built it. */}
            <div
              className="wv-vr-enter mt-[26vh] flex flex-col gap-3 sm:mt-7 sm:flex-row sm:items-center"
              style={{ '--wv-vr-step': 3 } as React.CSSProperties}
            >
              <button
                type="button"
                onClick={() => void start()}
                disabled={loading}
                data-testid="start-court"
                className="btn-enter-room"
              >
                {loading ? 'Opening the room…' : 'Start a Verdict Room'}
                <span
                  aria-hidden
                  className="wv-enter-sheen pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                />
              </button>
              <p className="text-[13px] text-slate-400 sm:max-w-[15rem]">
                Opens a live room and a code to share.
              </p>
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm font-semibold text-red-300">
                {error}
              </p>
            )}

            {/* TWO DOORS INTO THE SAME SYSTEM, and they no longer look alike.
                Quick Pick is a close, one-device huddle; Invite the Jury is
                everyone on their own screen. The visual weight differs
                accordingly — one is a warm compact tile, the other is wide and
                cool with the room's own accent. */}
            <div
              className="wv-vr-enter mt-8 grid gap-3 sm:grid-cols-2"
              data-testid="together-secondary"
              style={{ '--wv-vr-step': 4 } as React.CSSProperties}
            >
              <ModeCard
                testId="open-device"
                kind="here"
                title="Quick Pick"
                line="We're all here. Pass one phone around and settle it."
                onClick={() => setOpen(open === 'device' ? null : 'device')}
                expanded={open === 'device'}
              />
              <ModeCard
                testId="open-invite"
                kind="apart"
                title="Invite the Jury"
                line="Everyone votes from their own phone, wherever they are."
                onClick={() => void start()}
                busy={loading}
              />
            </div>
          </div>

          {/* THE SUPPORTING COLUMN. Real crews, or a designed empty state. */}
          <div
            className="wv-vr-enter mt-10 lg:mt-0"
            style={{ '--wv-vr-step': 5 } as React.CSSProperties}
          >
            <CrewRail onManage={() => setOpen(open === 'crews' ? null : 'crews')} />
          </div>
        </div>
      </section>

      {/* DISCLOSED PANELS, below the stage. Same components, same behaviour as
          before — they simply open under a composition instead of under a
          list of links. */}
      {open === 'device' && (
        <section className="mt-8" aria-label="Quick Pick">
          <p className="text-xs text-slate-500">
            Quick, private juries stored just on this phone — no accounts, no sharing.
          </p>
          <TogetherPlanner />
        </section>
      )}

      {open === 'crews' && (
        <section className="mt-8" aria-label="Saved crews">
          <p className="text-xs text-slate-400">
            Cloud crews sync across devices. Friends scan a QR, do a 30-second calibration, and their taste counts too.
          </p>
          <div className="mt-3">
            <CloudCrews />
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * One of the two modes. `kind` is the only thing that differs, and it changes
 * the whole feel rather than swapping an icon: "here" is warm and close,
 * "apart" is cool and distributed. The glyphs are drawn, not emoji — a room
 * full of people and a set of separate screens.
 */
function ModeCard({
  testId,
  kind,
  title,
  line,
  onClick,
  busy = false,
  expanded,
}: {
  testId: string;
  kind: 'here' | 'apart';
  title: string;
  line: string;
  onClick: () => void;
  busy?: boolean;
  expanded?: boolean;
}) {
  const here = kind === 'here';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      data-testid={testId}
      aria-expanded={expanded}
      className={`group relative flex min-h-[92px] flex-col justify-between overflow-hidden rounded-2xl border p-4 text-left transition
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950
        disabled:opacity-60 hover:-translate-y-0.5 ${
          here
            ? 'border-amber-300/25 bg-[linear-gradient(150deg,rgba(255,196,120,0.10),rgba(10,12,20,0.6))] hover:border-amber-300/45'
            : 'border-brand-400/25 bg-[linear-gradient(150deg,rgba(79,134,255,0.12),rgba(10,12,20,0.6))] hover:border-brand-400/55'
        }`}
    >
      <span className="flex items-center gap-2.5">
        <span aria-hidden className={here ? 'text-amber-200/90' : 'text-brand-200'}>
          {here ? <HuddleGlyph /> : <ScreensGlyph />}
        </span>
        <span className="text-base font-black tracking-tight text-white">{busy ? 'Opening…' : title}</span>
      </span>
      <span className="mt-2 text-[13px] leading-snug text-slate-400">{line}</span>
      <span
        aria-hidden
        className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl transition-opacity group-hover:opacity-100 ${
          here ? 'bg-amber-300/10 opacity-60' : 'bg-brand-400/12 opacity-60'
        }`}
      />
    </button>
  );
}

/** Three heads close together — one room, one screen. */
function HuddleGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="8" cy="9" r="3.1" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="9" r="3.1" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 19c.9-2.7 2.8-4 5-4s4.1 1.3 5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M13 19c.9-2.7 2.8-4 5-4 1.3 0 2.5.5 3.4 1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Separate screens, joined — everyone on their own device. */
function ScreensGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2.5" y="5" width="8" height="11" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.5" y="8" width="8" height="11" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 10.5h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
