'use client';

import { useState, useTransition } from 'react';
import type { FounderKey } from '@/lib/founder/access';
import type { FounderSession } from '@/lib/founder/sessionModel';
import {
  createFounderSession,
  refreshFounderSession,
  archiveFounderSession,
  renameFounderSession,
  reopenFounderSession,
  switchFounderSession,
} from '@/lib/actions/founderSessions';

/** Serializable session shape passed from the server shell (epoch ms → display). */
export interface SessionView {
  id: string;
  name: string;
  status: 'active' | 'archived';
  createdAt: number;
  lastActiveAt: number;
}

export function toView(s: FounderSession): SessionView {
  return { id: s.id, name: s.name, status: s.status, createdAt: s.createdAt, lastActiveAt: s.lastActiveAt };
}

function fmt(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function FounderSessions({
  founder,
  founderName,
  sessions,
  migrationReady,
}: {
  founder: FounderKey;
  founderName: string;
  sessions: SessionView[];
  migrationReady: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const active = sessions.filter((s) => s.status === 'active');
  const archived = sessions.filter((s) => s.status === 'archived');

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string, after?: () => void) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? okMsg : r.error ?? 'Something went wrong.');
      after?.();
    });
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-white">Test sessions</h2>
        <span className="text-[11px] text-slate-500">{sessions.length} total</span>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        Each session is an independent Watch-DNA run for {founderName}. Start a new one for a clean slate, or refresh to
        archive the current DNA and begin fresh — old sessions are kept so you can compare before and after.
      </p>

      {!migrationReady && (
        <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          Session storage isn&rsquo;t live yet (migration 0025 not applied in this environment). Controls below will save
          once it is; your Watch-DNA ratings already work.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => createFounderSession({ founder }), 'New session started.')}
          className="btn-primary disabled:opacity-50"
        >
          + Start new session
        </button>
        <button
          type="button"
          disabled={pending || active.length === 0}
          onClick={() =>
            run(() => refreshFounderSession({ founder }), 'Refreshed — previous DNA archived, fresh slate started.')
          }
          className="btn-secondary disabled:opacity-50"
        >
          ↻ Refresh DNA (archive &amp; restart)
        </button>
      </div>

      {msg && <p className="mt-3 text-sm text-brand-200">{msg}</p>}

      {active.length > 0 && (
        <div className="mt-5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-300">Active</div>
          <ul className="mt-2 space-y-2">
            {active.map((s, i) => (
              <SessionRow
                key={s.id}
                s={s}
                isCurrent={i === 0}
                founder={founder}
                pending={pending}
                renaming={renaming === s.id}
                renameText={renameText}
                onStartRename={() => {
                  setRenaming(s.id);
                  setRenameText(s.name);
                }}
                onRenameText={setRenameText}
                onSubmitRename={() =>
                  run(() => renameFounderSession({ founder, id: s.id, name: renameText }), 'Renamed.', () => setRenaming(null))
                }
                onCancelRename={() => setRenaming(null)}
                onSwitch={() => run(() => switchFounderSession({ founder, id: s.id }), `Switched to “${s.name}”.`)}
                onArchive={() => run(() => archiveFounderSession({ founder, id: s.id }), 'Session archived.')}
              />
            ))}
          </ul>
        </div>
      )}

      {archived.length > 0 && (
        <div className="mt-5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">History ({archived.length})</div>
          <ul className="mt-2 space-y-2">
            {archived.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-200">{s.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {fmt(s.createdAt)} → {fmt(s.lastActiveAt)} · archived
                  </div>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => reopenFounderSession({ founder, id: s.id }), `Reopened “${s.name}”.`)}
                  className="flex-none text-xs font-semibold text-brand-300 hover:text-brand-200 disabled:opacity-50"
                  data-testid="session-reopen"
                >
                  Reopen
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function SessionRow({
  s,
  isCurrent,
  pending,
  renaming,
  renameText,
  onStartRename,
  onRenameText,
  onSubmitRename,
  onCancelRename,
  onSwitch,
  onArchive,
}: {
  s: SessionView;
  isCurrent: boolean;
  founder: FounderKey;
  pending: boolean;
  renaming: boolean;
  renameText: string;
  onStartRename: () => void;
  onRenameText: (v: string) => void;
  onSubmitRename: () => void;
  onCancelRename: () => void;
  onSwitch: () => void;
  onArchive: () => void;
}) {
  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${isCurrent ? 'border-emerald-400/40 bg-emerald-500/10' : 'border-white/10 bg-white/5'}`}
      data-testid="session-row"
    >
      <div className="min-w-0 flex-1">
        {renaming ? (
          <div className="flex items-center gap-2">
            <input
              value={renameText}
              onChange={(e) => onRenameText(e.target.value)}
              maxLength={60}
              className="w-full rounded-md border border-white/20 bg-black/40 px-2 py-1 text-sm text-white"
              aria-label="Session name"
            />
            <button type="button" onClick={onSubmitRename} disabled={pending} className="text-xs font-semibold text-brand-300">
              Save
            </button>
            <button type="button" onClick={onCancelRename} className="text-xs text-slate-400">
              Cancel
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-white">{s.name}</span>
              {isCurrent && (
                <span className="flex-none rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-200" data-testid="session-current">
                  Current
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500">started {fmt(s.createdAt)} · active</div>
          </>
        )}
      </div>
      {!renaming && (
        <div className="flex flex-none gap-2">
          {!isCurrent && (
            <button type="button" onClick={onSwitch} disabled={pending} className="text-xs font-semibold text-emerald-300 hover:text-emerald-200 disabled:opacity-50" data-testid="session-switch">
              Switch to
            </button>
          )}
          <button type="button" onClick={onStartRename} className="text-xs font-semibold text-slate-300 hover:text-white">
            Rename
          </button>
          <button type="button" onClick={onArchive} disabled={pending} className="text-xs font-semibold text-slate-400 hover:text-white">
            Archive
          </button>
        </div>
      )}
    </li>
  );
}
