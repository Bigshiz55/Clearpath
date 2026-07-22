'use client';

import { useEffect, useState } from 'react';
import { getQuickAddToken, regenerateQuickAddToken } from '@/lib/actions/profile';

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}
      className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-white/10"
    >
      {done ? 'Copied ✓' : label}
    </button>
  );
}

export function ConnectPhone() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
    getQuickAddToken()
      .then((r) => (r.ok && r.token ? setToken(r.token) : setError(r.error ?? 'Failed.')))
      .catch(() => setError('Failed.'));
  }, []);

  const endpoint = token ? `${origin}/api/quick-add?token=${token}&q=` : '';

  async function roll() {
    setToken(null);
    const r = await regenerateQuickAddToken();
    if (r.ok && r.token) setToken(r.token);
    else setError(r.error ?? 'Failed.');
  }

  if (error) {
    return <p className="card p-4 text-sm text-red-200">{error}</p>;
  }
  if (!token) return <p className="text-sm text-slate-400">Loading your key…</p>;

  return (
    <div className="space-y-5">
      <div className="card p-4">
        <div className="text-sm font-semibold text-white">Your Quick-Add key</div>
        <p className="mt-1 text-xs text-slate-400">Keep this private — anyone with it can add to your list.</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-black/40 px-2.5 py-1.5 text-xs text-brand-200">{token}</code>
          <Copy text={token} label="Copy key" />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-black/40 px-2.5 py-1.5 text-[11px] text-slate-300">{endpoint}</code>
          <Copy text={endpoint} label="Copy URL" />
        </div>
        <button onClick={roll} className="btn-ghost mt-2 text-xs text-slate-400">Reset key</button>
      </div>

      <div className="card p-4">
        <div className="text-sm font-semibold text-white">🗣️ iPhone: “Hey Siri, add to WatchVerdict”</div>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
          <li>Open the <span className="text-white">Shortcuts</span> app → <span className="text-white">+</span> to make a new shortcut.</li>
          <li>Add action <span className="text-white">“Dictate Text.”</span></li>
          <li>Add action <span className="text-white">“Get Contents of URL.”</span> Set it to the <span className="text-white">Copy URL</span> above, then tap the end and insert the <span className="text-white">Dictated Text</span> variable so it becomes <code className="text-[11px]">…&amp;q=[Dictated&nbsp;Text]</code>.</li>
          <li>Name it <span className="text-white">“Add to WatchVerdict.”</span> Done — say <span className="text-white">“Hey Siri, Add to WatchVerdict.”</span></li>
        </ol>
      </div>

      <div className="card p-4">
        <div className="text-sm font-semibold text-white">📸 iPhone: add from a screenshot</div>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
          <li>New shortcut → in settings, turn on <span className="text-white">“Show in Share Sheet”</span> and accept <span className="text-white">Images</span>.</li>
          <li>Add <span className="text-white">“Extract Text from Image”</span> (Shortcut Input).</li>
          <li>Add <span className="text-white">“Get Contents of URL”</span> → the <span className="text-white">Copy URL</span> above with the <span className="text-white">Extracted Text</span> on the end (<code className="text-[11px]">&amp;q=[Extracted&nbsp;Text]</code>).</li>
          <li>Name it <span className="text-white">“Add to WatchVerdict.”</span> Now: screenshot a title → <span className="text-white">Share → Add to WatchVerdict.</span></li>
        </ol>
        <p className="mt-2 text-[11px] text-slate-500">Works when the title text is visible on screen (it reads the words, not the poster art).</p>
      </div>

      <p className="text-xs text-slate-500">
        Added titles land on your Watchlist as “Possible.” On Android, once the app is installed you can also
        just use the system <span className="text-slate-300">Share → WatchVerdict</span>.
      </p>
    </div>
  );
}
