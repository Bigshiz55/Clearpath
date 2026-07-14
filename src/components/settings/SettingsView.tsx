'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PreferenceRule, PreferenceTrait } from '@/lib/types';
import { humanTrait } from '@/lib/scoring/traits';
import { avoidRule, loveRule, SCOTT_RULES } from '@/lib/scoring/preferences';
import { updateProfile, replacePreferenceRules } from '@/lib/actions/profile';
import { deactivateShare } from '@/lib/actions/share';
import { deleteAccount } from '@/lib/actions/account';
import { useToast } from '@/components/Toast';

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
  rules: PreferenceRule[];
  shares: ShareRow[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [displayName, setDisplayName] = useState(props.displayName);
  const [region, setRegion] = useState(props.region);
  const [personalLabel, setPersonalLabel] = useState(props.personalLabel);
  const [savingProfile, setSavingProfile] = useState(false);

  const initialAvoid = new Set(props.rules.filter((r) => r.weight < 0).map((r) => r.trait));
  const initialLove = new Set(props.rules.filter((r) => r.weight > 0).map((r) => r.trait));
  const [avoid, setAvoid] = useState<Set<PreferenceTrait>>(initialAvoid);
  const [love, setLove] = useState<Set<PreferenceTrait>>(initialLove);
  const [savingRules, setSavingRules] = useState(false);

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
