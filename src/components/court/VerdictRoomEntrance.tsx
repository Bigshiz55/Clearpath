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
 * ── MODE BEFORE CREATION ──────────────────────────────────────────────────
 * The mode question is the entrance. `useStartCourt` still creates the room
 * (same RPC, same host token, same redirect), but ONLY from the Jury Room
 * card — Quick Pick discloses `TogetherPlanner` in place and creates
 * nothing, so a room can never be mislabeled. Crews still open `CloudCrews`.
 * The mobile suite drives `open-device`, `open-invite`, `open-crews` and
 * `together-secondary`; the old generic pre-mode create control is gone and
 * its absence is itself asserted.
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
            {/* THE MODE QUESTION LEADS. A generic room-creation button used
                to sit here, ABOVE the two modes — which meant a room was
                created before anyone said what kind of verdict this was. The question is the entrance now, and NOTHING is created
                until a mode is chosen: Quick Pick opens the on-device planner
                (no room, no invitation flow), Start Jury Room is the ONE
                creation path — so a room can never be mislabeled, because a
                room only ever exists as a Jury Room. */}
            <p
              className="wv-vr-enter mt-4 max-w-md text-base leading-relaxed text-slate-300 sm:text-lg"
              data-testid="verdict-mode-question"
              style={{ '--wv-vr-step': 2 } as React.CSSProperties}
            >
              Everyone weighs in. One title wins. What kind of verdict are you running?
            </p>

            {/* A PHONE HAS NO GUTTERS, SO IT GETS A BAND. On a wide screen the
                room shows either side of this column; at 390 the column IS the
                screen, so the layout opens a deliberate gap here and the stage
                shows through it. Without this the shadow room is present and
                invisible, which is the same as not having built it. */}
            <div
              className="wv-vr-enter mt-[26vh] grid gap-3 sm:mt-7 sm:grid-cols-2"
              data-testid="together-secondary"
              style={{ '--wv-vr-step': 3 } as React.CSSProperties}
            >
              <ModeCard
                testId="open-device"
                kind="here"
                title="Quick Pick"
                line="We're all here — pass one phone around and settle it now."
                action="Start Quick Pick"
                onClick={() => setOpen(open === 'device' ? null : 'device')}
                expanded={open === 'device'}
              />
              <ModeCard
                testId="open-invite"
                kind="apart"
                title="Jury Room"
                line="Everyone on their own phone — opens a live room and a code to share."
                action="Start Jury Room"
                onClick={() => void start()}
                busy={loading}
              />
            </div>
            {error && (
              <p role="alert" data-testid="room-error" className="mt-3 text-sm font-semibold text-red-300">
                {error}
              </p>
            )}
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
  action,
  onClick,
  busy = false,
  expanded,
}: {
  testId: string;
  kind: 'here' | 'apart';
  title: string;
  line: string;
  /** The explicit start label — the card SAYS what pressing it begins. */
  action: string;
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
      className={`group relative flex min-h-[112px] flex-col justify-between overflow-hidden rounded-2xl border p-4 text-left transition
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
        <span className="text-base font-black tracking-tight text-white">{title}</span>
      </span>
      <span className="mt-2 text-[13px] leading-snug text-slate-400">{line}</span>
      <span
        className={`mt-3 inline-flex items-center gap-1 text-sm font-black ${
          here ? 'text-amber-200' : 'text-brand-200'
        }`}
      >
        {busy ? 'Opening the room…' : action} <span aria-hidden>→</span>
      </span>
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
