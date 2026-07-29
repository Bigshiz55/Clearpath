'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getBuildInfo, resolveEnvironment, badgeText, isPublicProduction, type EnvKind } from '@/lib/buildInfo';

/**
 * The always-visible build/version badge shown at the top of EVERY screen, so a
 * screenshot instantly identifies the running build, branch, environment and
 * version. Values come from build-time metadata (see next.config.mjs +
 * lib/buildInfo) — never hardcoded.
 *
 * Rules:
 *   • Production (and not a founder route): only `WatchVerd1ct v0.9.18`.
 *   • Preview / Development / TestScott|Heather|Amy: `Env • branch • sha • vX`.
 * Tapping or long-pressing the badge (or "Developer Info" in Settings, which
 * dispatches `wv:open-build-info`) opens the Build Information sheet for QA.
 */
const ENV_STYLE: Record<EnvKind, string> = {
  Production: 'border-white/10 bg-black/45 text-slate-300',
  Preview: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
  Development: 'border-sky-400/40 bg-sky-500/15 text-sky-200',
  TestScott: 'border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-200',
  TestHeather: 'border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-200',
  TestAmy: 'border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-200',
};

export function BuildVersionBadge() {
  const pathname = usePathname() || '/';
  const info = getBuildInfo();
  const env = resolveEnvironment(pathname, info.vercelEnv);
  const [open, setOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Let Settings (or anywhere) open the sheet via a global event.
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('wv:open-build-info', handler);
    return () => window.removeEventListener('wv:open-build-info', handler);
  }, []);

  const startPress = useCallback(() => {
    pressTimer.current = setTimeout(() => setOpen(true), 450);
  }, []);
  const endPress = useCallback(() => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }, []);

  // THE VERSION PILL IS A DEBUG INSTRUMENT, NOT PRODUCT CHROME. In public
  // production it renders nothing at the top of every screen — real users
  // don't need a floating build string, and it sat above the logo on every
  // page. The string is still reachable where debugging happens: preview /
  // development / founder-test environments keep the pill, and Settings'
  // "Developer Info" opens the full sheet in any environment via the
  // `wv:open-build-info` event this component keeps listening for.
  if (isPublicProduction(env)) return open ? <BuildInfoSheet env={env} onClose={() => setOpen(false)} /> : null;

  return (
    <>
      {/* FIXED thin bar in its own top band (height ≈ --wv-badge-h). Fixed, so it
          adds ZERO layout height — full-height (100dvh / min-h-dvh) screens don't
          overflow. The app header reserves matching top padding so the badge sits
          ABOVE the logo/controls and never overlaps them. The row is
          pointer-events-none; only the pill is interactive. */}
      <div
        // Absolute on a phone so it scrolls away with the header it sits on;
        // fixed from `sm`, where the header is sticky and the badge should ride
        // with it. Either way it is at the top of the document on load, which
        // is where a QA screenshot is taken.
        className="pointer-events-none absolute inset-x-0 top-0 z-[200] flex justify-center sm:fixed"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 2px)' }}
        data-testid="build-badge-row"
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          onPointerDown={startPress}
          onPointerUp={endPress}
          onPointerLeave={endPress}
          className={`pointer-events-auto inline-flex h-5 max-w-[92vw] items-center truncate rounded-full border px-2.5 text-[10px] font-semibold leading-none tracking-wide shadow-sm backdrop-blur ${ENV_STYLE[env]}`}
          aria-label="Build and version information"
          data-testid="build-badge"
        >
          {!isPublicProduction(env) && (
            <span aria-hidden className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle opacity-80" />
          )}
          <span className="truncate">{badgeText(env, info)}</span>
        </button>
      </div>

      {open && <BuildInfoSheet env={env} onClose={() => setOpen(false)} />}
    </>
  );
}

function BuildInfoSheet({ env, onClose }: { env: EnvKind; onClose: () => void }) {
  const info = getBuildInfo();
  const [copied, setCopied] = useState(false);

  const rows: [string, string][] = [
    ['Environment', env],
    ['App version', `v${info.appVersion}`],
    ['Branch', info.gitBranch || '—'],
    ['Commit', info.gitShaShort || '—'],
    ['Build time', info.buildTimeLabel],
    ['Deployment ID', info.deployId || '—'],
    ['Deployment host', info.deployUrl || '—'],
    ['Database', info.databaseEnv || '—'],
    ['Supabase project', info.supabaseProject || '—'],
    ['Schema / migration', info.schemaVersion || '—'],
    ['API version', info.apiVersion],
  ];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(rows.map(([k, v]) => `${k}: ${v}`).join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div
      className="fixed inset-0 z-[210] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onClick={onClose}
      data-testid="build-info-sheet"
    >
      <div
        className="w-full max-w-md rounded-3xl border border-white/10 bg-ink-900 p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-white">🛠 Build Information</h2>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm text-slate-400 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>
        <p className="mt-0.5 text-[11px] text-slate-500">For debugging &amp; QA. Non-secret build metadata only.</p>

        <dl className="mt-4 divide-y divide-white/5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 py-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{k}</dt>
              <dd className="max-w-[62%] truncate text-right text-sm font-medium text-white" title={v}>
                {v}
              </dd>
            </div>
          ))}
        </dl>

        <button type="button" onClick={copy} className="btn-secondary mt-4 w-full text-sm" data-testid="build-info-copy">
          {copied ? 'Copied ✓' : 'Copy build info'}
        </button>
      </div>
    </div>
  );
}
