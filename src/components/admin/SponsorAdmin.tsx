'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveSponsor, deleteSponsor, type AdminSponsor, type SponsorInput } from '@/lib/actions/adminSponsors';
import { useToast } from '@/components/Toast';

type FormState = {
  id?: string;
  name: string;
  judgeName: string;
  tagline: string;
  emoji: string;
  accent: string;
  ctaLabel: string;
  ctaUrl: string;
  discountLabel: string;
  discountCode: string;
  scope: 'national' | 'region' | 'local';
  region: string;
  lat: string;
  lng: string;
  radiusKm: string;
  active: boolean;
};

const BLANK: FormState = {
  name: '', judgeName: '', tagline: '', emoji: '🍕', accent: '#e11d48',
  ctaLabel: '', ctaUrl: '', discountLabel: '', discountCode: '',
  scope: 'national', region: '', lat: '', lng: '', radiusKm: '', active: true,
};

function toForm(s: AdminSponsor): FormState {
  return {
    id: s.id, name: s.name, judgeName: s.judgeName, tagline: s.tagline ?? '', emoji: s.emoji ?? '',
    accent: s.accent ?? '#e11d48', ctaLabel: s.ctaLabel ?? '', ctaUrl: s.ctaUrl ?? '',
    discountLabel: s.discountLabel ?? '', discountCode: s.discountCode ?? '', scope: s.scope,
    region: s.region ?? '', lat: s.lat?.toString() ?? '', lng: s.lng?.toString() ?? '',
    radiusKm: s.radiusKm?.toString() ?? '', active: s.active,
  };
}

function toInput(f: FormState): SponsorInput {
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  return {
    id: f.id,
    name: f.name, judgeName: f.judgeName, tagline: f.tagline, emoji: f.emoji, accent: f.accent,
    ctaLabel: f.ctaLabel, ctaUrl: f.ctaUrl, discountLabel: f.discountLabel, discountCode: f.discountCode,
    scope: f.scope, region: f.region, lat: num(f.lat), lng: num(f.lng), radiusKm: num(f.radiusKm), active: f.active,
  };
}

export function SponsorAdmin({ initialSponsors }: { initialSponsors: AdminSponsor[] }) {
  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const totalClaims = initialSponsors.reduce((a, s) => a + s.claims, 0);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function submit() {
    setSaving(true);
    const res = await saveSponsor(toInput(form));
    setSaving(false);
    if (res.ok) {
      toast.show(form.id ? 'Sponsor updated.' : 'Sponsor added.', 'success');
      setForm(BLANK);
      router.refresh();
    } else {
      toast.show(res.error ?? 'Failed.', 'error');
    }
  }

  async function remove(s: AdminSponsor) {
    if (!confirm(`Delete "${s.name}"? This removes the judge and its claim history.`)) return;
    const res = await deleteSponsor(s.id);
    toast.show(res.ok ? 'Deleted.' : res.error ?? 'Failed.', res.ok ? 'info' : 'error');
    if (res.ok) router.refresh();
  }

  async function toggleActive(s: AdminSponsor) {
    const res = await saveSponsor({ ...toInput(toForm(s)), active: !s.active });
    toast.show(res.ok ? (s.active ? 'Paused.' : 'Now live.') : res.error ?? 'Failed.', res.ok ? 'info' : 'error');
    if (res.ok) router.refresh();
  }

  const field = 'w-full rounded-xl border border-white/10 bg-ink-900/80 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-brand-400/70';

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex gap-3">
        <div className="card flex-1 p-4 text-center">
          <div className="text-2xl font-bold text-white">{initialSponsors.filter((s) => s.active).length}</div>
          <div className="text-xs text-slate-400">live judges</div>
        </div>
        <div className="card flex-1 p-4 text-center">
          <div className="text-2xl font-bold text-gold-400">{totalClaims}</div>
          <div className="text-xs text-slate-400">total coupon claims</div>
        </div>
      </div>

      {/* Form */}
      <div className="card p-5">
        <h2 className="text-lg font-semibold text-white">{form.id ? 'Edit sponsor' : 'Add a sponsor'}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-400">Brand name
            <input className={field} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Corner Slice Pizza" />
          </label>
          <label className="text-xs text-slate-400">Judge name
            <input className={field} value={form.judgeName} onChange={(e) => set('judgeName', e.target.value)} placeholder="The Corner Slice Judge" />
          </label>
          <label className="text-xs text-slate-400 sm:col-span-2">Tagline
            <input className={field} value={form.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="A great verdict pairs with a great slice." />
          </label>
          <label className="text-xs text-slate-400">Emoji
            <input className={field} value={form.emoji} onChange={(e) => set('emoji', e.target.value)} placeholder="🍕" />
          </label>
          <label className="text-xs text-slate-400">Accent color
            <div className="flex gap-2">
              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(form.accent) ? form.accent : '#e11d48'} onChange={(e) => set('accent', e.target.value)} className="h-11 w-14 rounded-lg border border-white/10 bg-transparent" />
              <input className={field} value={form.accent} onChange={(e) => set('accent', e.target.value)} placeholder="#e11d48" />
            </div>
          </label>
          <label className="text-xs text-slate-400">Coupon label (shown)
            <input className={field} value={form.discountLabel} onChange={(e) => set('discountLabel', e.target.value)} placeholder="5% off your order tonight" />
          </label>
          <label className="text-xs text-slate-400">Coupon code (revealed on claim)
            <input className={field} value={form.discountCode} onChange={(e) => set('discountCode', e.target.value)} placeholder="COURTROOM5" />
          </label>
          <label className="text-xs text-slate-400">CTA label
            <input className={field} value={form.ctaLabel} onChange={(e) => set('ctaLabel', e.target.value)} placeholder="Order a pizza" />
          </label>
          <label className="text-xs text-slate-400">CTA link
            <input className={field} value={form.ctaUrl} onChange={(e) => set('ctaUrl', e.target.value)} placeholder="https://…" />
          </label>

          <label className="text-xs text-slate-400">Reach
            <select className={field} value={form.scope} onChange={(e) => set('scope', e.target.value as FormState['scope'])}>
              <option value="national">National (everyone)</option>
              <option value="region">Region (a country)</option>
              <option value="local">Local (a radius)</option>
            </select>
          </label>
          {form.scope === 'region' && (
            <label className="text-xs text-slate-400">Country code
              <input className={field} value={form.region} onChange={(e) => set('region', e.target.value.toUpperCase())} placeholder="US" maxLength={2} />
            </label>
          )}
          {form.scope === 'local' && (
            <>
              <label className="text-xs text-slate-400">Latitude
                <input className={field} value={form.lat} onChange={(e) => set('lat', e.target.value)} placeholder="40.7128" inputMode="decimal" />
              </label>
              <label className="text-xs text-slate-400">Longitude
                <input className={field} value={form.lng} onChange={(e) => set('lng', e.target.value)} placeholder="-74.0060" inputMode="decimal" />
              </label>
              <label className="text-xs text-slate-400">Radius (km)
                <input className={field} value={form.radiusKm} onChange={(e) => set('radiusKm', e.target.value)} placeholder="3" inputMode="decimal" />
              </label>
            </>
          )}
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} className="h-4 w-4 accent-brand-500" />
          Live now
        </label>

        <div className="mt-4 flex gap-2">
          <button onClick={submit} disabled={saving || !form.name || !form.judgeName} className="btn-primary">
            {saving ? 'Saving…' : form.id ? 'Save changes' : 'Add sponsor'}
          </button>
          {form.id && <button onClick={() => setForm(BLANK)} className="btn-ghost">Cancel</button>}
        </div>
      </div>

      {/* List */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-white">All sponsors</h2>
        {initialSponsors.length === 0 ? (
          <p className="text-sm text-slate-400">No sponsors yet. Add one above.</p>
        ) : (
          <ul className="space-y-2">
            {initialSponsors.map((s) => (
              <li key={s.id} className="card flex items-center gap-3 p-3">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-xl text-xl" style={{ background: `${(/^#[0-9a-fA-F]{6}$/.test(s.accent ?? '') ? s.accent : '#7aa8ff')}22` }}>
                  {s.emoji ?? '⚖️'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">{s.judgeName}</div>
                  <div className="text-xs text-slate-400">
                    {s.name} · {s.scope}
                    {s.scope === 'region' && s.region ? ` (${s.region})` : ''}
                    {s.scope === 'local' && s.radiusKm ? ` (${s.radiusKm}km)` : ''}
                    {' · '}
                    <span className="text-gold-400">{s.claims} claims</span>
                    {!s.active && <span className="text-red-300"> · paused</span>}
                  </div>
                </div>
                <button onClick={() => toggleActive(s)} className="btn-ghost text-xs">{s.active ? 'Pause' : 'Go live'}</button>
                <button onClick={() => setForm(toForm(s))} className="btn-secondary text-xs">Edit</button>
                <button onClick={() => remove(s)} className="btn-ghost text-xs text-red-300">Delete</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
