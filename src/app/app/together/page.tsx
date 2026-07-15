import type { Metadata } from 'next';
import { CloudCrews } from '@/components/CloudCrews';
import { TogetherPlanner } from '@/components/TogetherPlanner';
import { StartLiveCourt } from '@/components/StartLiveCourt';

export const metadata: Metadata = {
  title: 'Tonight, Together · WatchVerdict',
};

export default function TogetherPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">👪 Tonight, Together</h1>
      <p className="mt-2 text-sm text-slate-400">
        One pick the whole room will actually agree on — scored for <em>everyone</em>, never
        suggesting something on someone’s hard-no list.
      </p>

      <section className="mt-6 rounded-2xl border border-brand-400/30 bg-brand-500/10 p-4">
        <h2 className="text-sm font-bold text-white">⚖️ Live Taste Court</h2>
        <p className="mt-1 text-xs text-slate-300">
          Everyone joins from their own phone — even from different places. Private moods, blind
          finalists, one private veto each, and a judged verdict. Share the QR and go.
        </p>
        <div className="mt-3">
          <StartLiveCourt />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-brand-300">Synced crews · share with a QR code</h2>
        <p className="mt-1 text-xs text-slate-400">
          Cloud crews sync across devices. Friends scan a QR, do a 30-second calibration, and join — their taste counts too.
        </p>
        <div className="mt-3">
          <CloudCrews />
        </div>
      </section>

      <section className="mt-8 border-t border-white/10 pt-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">On this device</h2>
        <p className="mt-1 text-xs text-slate-500">Quick, private crews stored just on this phone — no accounts, no sharing.</p>
        <TogetherPlanner />
      </section>
    </div>
  );
}
