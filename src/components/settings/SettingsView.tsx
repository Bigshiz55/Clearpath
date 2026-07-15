'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PreferenceRule, PreferenceTrait } from '@/lib/types';
import { humanTrait } from '@/lib/scoring/traits';
import { avoidRule, loveRule, SCOTT_RULES } from '@/lib/scoring/preferences';
import { updateProfile, replacePreferenceRules, updateDigestPrefs, updateMyServices } from '@/lib/actions/profile';
import { setPublicActivity } from '@/lib/actions/social';
import { deactivateShare } from '@/lib/actions/share';
import { deleteAccount } from '@/lib/actions/account';
import { useToast } from '@/components/Toast';
import { STREAMING_SERVICES } from '@/lib/services';
import { EnableNotifications } from '@/components/EnableNotifications';

export interface ShareRow {
  token: string;
  kind: string;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  title: string;
}

const AVOIDABLE: PreferenceTrait[] = ['supernatural', 'paranormal', 'science_fiction', 'fantasy', 'noir', 'slow_burn'];
const LOVABLE: PreferenceTrait[] = ['grounded_crime', 'psychological_thriller', 'detective_mystery', 'domestic_thriller', 'serial_killer'];

const REGIONS = ['US', 'GB', 'CA', 'AU', 'IE', 'DE', 'FR', 'IN', 'BR', 'MX'];

export function SettingsView(props: {
  email: string;
  displayName: string;
  username: string;
  region: string;
  personalLabel: string;
  dailyDigest: boolean;
  digestMinScore: number;
  rules: PreferenceRule[];
  shares: ShareRow[];
  myServices: number[];
  publicActivity: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [services, setServices] = useState<Set<number>>(new Set(props.myServices));
  const [savingServices, setSavingServices] = useState(false);

  const [publicOn, setPublicOn] = useState(props.publicActivity);
  const [savingPublic, setSavingPublic] = useState(false);

  async function togglePublic(on: boolean) {
    setPublicOn(on);
    setSavingPublic(true);
    const res = await setPublicActivity({ on });
    setSavingPublic(false);
    if (res.ok) {
      toast.show(on ? 'Your verdicts are now visible to followers.' : 'Your activity is private again.', 'success');
      router.refresh();
    } else {
      setPublicOn(!on);
      toast.show(res.error ?? 'Failed.', 'error');
    }
  }

  function toggleService(id: number) {
    setServices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveServices() {
    setSavingServices(true);
    const res = await updateMyServices({ services: Array.from(services) });
    setSavingServices(false);
    toast.show(res.ok ? 'Services saved.' : res.error ?? 'Failed.', res.ok ? 'success' : 'error');
    if (res.ok) router.refresh();
  }

  const [displayName, setDisplayName] = useState(props.displayName);
  const [region, setRegion] = useState(props.region);
  const [personalLabel, setPersonalLabel] = useState(props.personalLabel);
  const [savingProfile, setSavingProfile] = useState(false);

  const initialAvoid = new Set(props.rules.filter((r) => r.weight < 0).map((r) => r.trait));
  const initialLove = new Set(props.rules.filter((r) => r.weight > 0).map((r) => r.trait));
  const [avoid, setAvoid] = useState<Set<PreferenceTrait>>(initialAvoid);
  const [love, setLove] = useState<Set<PreferenceTrait>>(initialLove);
  const [savingRules, setSavingRules] = useState(false);

  const [dailyDigest, setDailyDigest] = useState(props.dailyDigest);
  const [minScore, setMinScore] = useState(props.digestMinScore);
  const [savingDigest, setSavingDigest] = useState(false);

  const [shares, setShares] = useState(props.shares);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function toggle(set: Set<PreferenceTrait>, val: PreferenceTrait, setter: (s: Set<PreferenceTrait>) => void) {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setter(next);
  }

  async function saveProfile() {
    setSavingProfile(true);
    const res = await updateProfile({ displayName, region, personalLabel });
    setSavingProfile(false);
    toast.show(res.ok ? 'Profile saved.' : res.error ?? 'Failed.', res.ok ? 'success' : 'error');
    if (res.ok) router.refresh();
  }

  async function saveRules() {
    setSavingRules(true);
    const rules: PreferenceRule[] = [
      ...Array.from(avoid).map((t) => avoidRule(t)),
      ...Array.from(love).map((t) => loveRule(t)),
    ];
    const res = await replacePreferenceRules({
      rules: rules.map((r) => ({ trait: r.trait, weight: r.weight, requiresDefining: r.requiresDefining, label: r.label })),
    });
    setSavingRules(false);
    toast.show(res.ok ? 'Preferences saved.' : res.error ?? 'Failed.', res.ok ? 'success' : 'error');
    if (res.ok) router.refresh();
  }

  async function loadScottPreset() {
    setAvoid(new Set(SCOTT_RULES.filter((r) => r.weight < 0).map((r) => r.trait)));
    setLove(new Set(SCOTT_RULES.filter((r) => r.weight > 0).map((r) => r.trait)));
    toast.show('Scott preset loaded — remember to save.', 'info');
  }

  async function saveDigest() {
    setSavingDigest(true);
    const res = await updateDigestPrefs({ dailyDigest, digestMinScore: minScore });
    setSavingDigest(false);
    toast.show(res.ok ? 'Digest settings saved.' : res.error ?? 'Failed.', res.ok ? 'success' : 'error');
    if (res.ok) router.refresh();
  }

  async function revoke(token: string) {
    const res = await deactivateShare(token);
    if (res.ok) {
      setShares((prev) => prev.map((s) => (s.token === token ? { ...s, isActive: false } : s)));
      toast.show('Share link deactivated.', 'info');
    } else {
      toast.show(res.error ?? 'Failed.', 'error');
    }
  }

  async function doDelete() {
    setDeleting(true);
    const res = await deleteAccount();
    setDeleting(false);
    if (res.ok) {
      router.push('/');
      router.refresh();
    } else {
      toast.show(res.error ?? 'Failed to delete account.', 'error');
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">Settings</h1>

      {/* Profile */}
      <section className="card p-5">
        <h2 className="text-lg font-semibold text-white">Profile</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="label" htmlFor="dn">Display name</label>
            <input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="pl">Personal match label</label>
              <input id="pl" value={personalLabel} onChange={(e) => setPersonalLabel(e.target.value)} className="input" placeholder="Scott Match" />
            </div>
            <div>
              <label className="label" htmlFor="rg">Viewing country</label>
              <select id="rg" value={region} onChange={(e) => setRegion(e.target.value)} className="input">
                {REGIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Signed in as {props.email}
            {props.username ? ` · @${props.username}` : ''}
          </div>
          <button onClick={saveProfile} disabled={savingProfile} className="btn-primary">
            {savingProfile ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </section>

      {/* Preferences */}
      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Taste & preferences</h2>
          <button onClick={loadScottPreset} className="text-xs text-brand-300 hover:underline">Load Scott preset</button>
        </div>
        <div className="mt-4 space-y-4">
          <div>
            <div className="label">Avoid (penalized when defining)</div>
            <div className="flex flex-wrap gap-2">
              {AVOIDABLE.map((t) => (
                <button key={t} onClick={() => toggle(avoid, t, setAvoid)} className={`chip border ${avoid.has(t) ? 'chip-active' : ''}`}>
                  {humanTrait(t)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label">Love (boosted)</div>
            <div className="flex flex-wrap gap-2">
              {LOVABLE.map((t) => (
                <button key={t} onClick={() => toggle(love, t, setLove)} className={`chip border ${love.has(t) ? 'chip-active' : ''}`}>
                  {humanTrait(t)}
                </button>
              ))}
            </div>
          </div>
          <button onClick={saveRules} disabled={savingRules} className="btn-primary">
            {savingRules ? 'Saving…' : 'Save preferences'}
          </button>
        </div>
      </section>

      {/* My streaming services */}
      <section className="card p-5">
        <h2 className="text-lg font-semibold text-white">My streaming services</h2>
        <p className="mt-1 text-sm text-slate-400">
          Pick what you subscribe to. Every verdict will flag what’s{' '}
          <span className="font-semibold text-emerald-300">✓ free on a plan you have</span> vs. what needs a rental —
          so you can tell at a glance what you can actually watch tonight.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {STREAMING_SERVICES.map((s) => (
            <button
              key={s.id}
              onClick={() => toggleService(s.id)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition ${
                services.has(s.id)
                  ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100'
                  : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <span aria-hidden>{s.emoji}</span>
              {s.name}
              {services.has(s.id) && <span className="text-xs font-bold text-emerald-300">✓</span>}
            </button>
          ))}
        </div>
        <button onClick={saveServices} disabled={savingServices} className="btn-primary mt-4">
          {savingServices ? 'Saving…' : 'Save services'}
        </button>
      </section>

      {/* Friends / public activity */}
      <section className="card p-5">
        <h2 className="text-lg font-semibold text-white">Friends &amp; public profile</h2>
        <p className="mt-1 text-sm text-slate-400">
          {props.username ? (
            <>
              Your handle is <span className="font-semibold text-slate-200">@{props.username}</span> — share it so
              friends can follow you.
            </>
          ) : (
            <>Set a username above so friends can find and follow you.</>
          )}
        </p>
        <label className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
          <span className="text-sm text-slate-200">
            Share my verdicts publicly
            <span className="block text-xs text-slate-500">
              People who follow you (and anyone who opens your profile) can see your recent verdicts. Off by default.
            </span>
          </span>
          <input
            type="checkbox"
            checked={publicOn}
            disabled={savingPublic}
            onChange={(e) => togglePublic(e.target.checked)}
            className="h-5 w-5 accent-brand-500"
          />
        </label>
      </section>

      {/* Notifications */}
      <section className="card p-5">
        <h2 className="text-lg font-semibold text-white">Notifications</h2>
        <p className="mt-1 text-sm text-slate-400">
          Get a ping when something’s actually worth opening the app for — a new pick that fits you, a show you’re
          watching drops an episode, or your Docket’s about to reset. Off until you turn it on, per device.
        </p>
        <div className="mt-4">
          <EnableNotifications />
        </div>
      </section>

      {/* Daily digest */}
      <section className="card p-5">
        <h2 className="text-lg font-semibold text-white">Daily new-release digest</h2>
        <p className="mt-1 text-sm text-slate-400">
          Each morning we scan new movie &amp; TV releases and surface the ones that match your taste
          under “New for you”.
        </p>
        <div className="mt-4 space-y-4">
          <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
            <span className="text-sm text-slate-200">
              Scan new releases daily
              <span className="block text-xs text-slate-500">Turn off to stop building your “New for you” list.</span>
            </span>
            <input
              type="checkbox"
              checked={dailyDigest}
              onChange={(e) => setDailyDigest(e.target.checked)}
              className="h-5 w-5 accent-brand-500"
            />
          </label>
          <div>
            <label className="label" htmlFor="min">
              Only show matches at or above <span className="font-bold text-brand-200">{minScore}%</span>
            </label>
            <input
              id="min"
              type="range"
              min={40}
              max={95}
              step={1}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full accent-brand-500"
            />
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>More titles (40%)</span>
              <span>Only the best (95%)</span>
            </div>
          </div>
          <button onClick={saveDigest} disabled={savingDigest} className="btn-primary">
            {savingDigest ? 'Saving…' : 'Save digest settings'}
          </button>
        </div>
      </section>

      {/* Shares */}
      <section className="card p-5">
        <h2 className="text-lg font-semibold text-white">Share links</h2>
        {shares.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">You haven’t shared any verdicts yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-white/5">
            {shares.map((s) => (
              <li key={s.token} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="line-clamp-1 text-sm font-medium text-white">{s.title}</div>
                  <div className="text-xs text-slate-500">
                    {s.isActive ? 'Active' : 'Deactivated'}
                    {s.expiresAt ? ` · expires ${new Date(s.expiresAt).toLocaleDateString()}` : ''}
                  </div>
                </div>
                {s.isActive && (
                  <button onClick={() => revoke(s.token)} className="btn-ghost text-red-300 hover:bg-red-500/10">
                    Deactivate
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Danger zone */}
      <section className="card border-red-500/20 p-5">
        <h2 className="text-lg font-semibold text-red-200">Delete account</h2>
        <p className="mt-1 text-sm text-slate-400">
          Permanently deletes your account, watchlists, verdicts, preferences, and share links. This
          cannot be undone.
        </p>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="btn-secondary mt-4 border-red-500/40 text-red-200">
            Delete my account
          </button>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={doDelete} disabled={deleting} className="btn bg-red-500 text-white hover:bg-red-400">
              {deleting ? 'Deleting…' : 'Yes, permanently delete'}
            </button>
            <button onClick={() => setConfirmDelete(false)} className="btn-ghost">
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
