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
import { useT } from '@/i18n/I18nProvider';
import { STREAMING_SERVICES, LIVE_TV_PROVIDERS } from '@/lib/services';
import { EnableNotifications } from '@/components/EnableNotifications';
import { SimpleModeToggle } from '@/components/SimpleModeToggle';

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
  providerCatalog?: { id: number; name: string }[];
  publicActivity: boolean;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();

  const [services, setServices] = useState<Set<number>>(new Set(props.myServices));
  const [savingServices, setSavingServices] = useState(false);
  const [svcQuery, setSvcQuery] = useState('');

  // The everyday picks shown by default (real TMDB ids) + live-TV/cable boxes.
  const POPULAR_SERVICES = [...STREAMING_SERVICES, ...LIVE_TV_PROVIDERS];
  const catalog = props.providerCatalog ?? [];

  // Popular premium channels & add-ons to also surface by default — resolved
  // from the real catalog by name (so IDs are correct and availability still
  // matches). We prefer the clean parent brand, but if TMDB only carries a
  // "… Apple TV / Amazon Channel" variant (e.g. Hallmark+), we still surface it
  // under a clean label so it's never missing from the picker.
  const EXTRA_CHANNELS: { q: string; label: string }[] = [
    { q: 'britbox', label: 'BritBox' },
    { q: 'acorn', label: 'Acorn TV' },
    { q: 'hallmark', label: 'Hallmark+' },
    { q: 'amc+', label: 'AMC+' },
    { q: 'starz', label: 'Starz' },
    { q: 'showtime', label: 'Showtime' },
    { q: 'mgm+', label: 'MGM+' },
    { q: 'shudder', label: 'Shudder' },
    { q: 'sundance now', label: 'Sundance Now' },
    { q: 'mubi', label: 'MUBI' },
    { q: 'bet+', label: 'BET+' },
    { q: 'discovery+', label: 'Discovery+' },
    { q: 'espn', label: 'ESPN+' },
    { q: 'crunchyroll', label: 'Crunchyroll' },
    { q: 'criterion', label: 'Criterion Channel' },
  ];
  const isGranular = (n: string) => /(amazon channel|apple tv channel|roku premium channel|with ads|standard with ads)/.test(n);
  const popularIdSet = new Set(POPULAR_SERVICES.map((s) => s.id));
  const CATALOG_DEFAULTS: { id: number; name: string }[] = [];
  const seenExtra = new Set<number>();
  for (const { q, label } of EXTRA_CHANNELS) {
    const matches = (granularOk: boolean) =>
      catalog.find((c) => {
        const n = c.name.trim().toLowerCase();
        return n.includes(q) && (granularOk || !isGranular(n)) && !popularIdSet.has(c.id) && !seenExtra.has(c.id);
      });
    const clean = matches(false);
    const hit = clean ?? matches(true); // fall back to a channel variant if that's all TMDB has
    if (hit) {
      seenExtra.add(hit.id);
      // Keep the real name when it's already clean; relabel a channel variant.
      CATALOG_DEFAULTS.push({ id: hit.id, name: clean ? hit.name : label });
    }
  }

  // A name for any id we might need to render as a selected chip.
  const serviceName = (id: number): string =>
    POPULAR_SERVICES.find((s) => s.id === id)?.name ??
    catalog.find((c) => c.id === id)?.name ??
    t('account.settings.services.fallbackName', { id });

  // What to show: on a search, every matching real service + live-TV option;
  // otherwise the popular set plus anything already selected (so picks from a
  // prior search stay visible after you clear the box).
  const svcQ = svcQuery.trim().toLowerCase();
  const shownServices: { id: number; name: string; emoji?: string }[] = (() => {
    if (svcQ) {
      const fromPopular = POPULAR_SERVICES.filter((s) => s.name.toLowerCase().includes(svcQ));
      const popularIds = new Set(fromPopular.map((s) => s.id));
      const fromCatalog = catalog
        .filter((c) => c.name.toLowerCase().includes(svcQ) && !popularIds.has(c.id))
        .map((c) => ({ id: c.id, name: c.name }));
      return [...fromPopular, ...fromCatalog].slice(0, 80);
    }
    const shownIds = new Set([...POPULAR_SERVICES.map((s) => s.id), ...CATALOG_DEFAULTS.map((s) => s.id)]);
    const extras = Array.from(services)
      .filter((id) => !shownIds.has(id))
      .map((id) => ({ id, name: serviceName(id) }));
    return [...extras, ...POPULAR_SERVICES, ...CATALOG_DEFAULTS];
  })();

  const [publicOn, setPublicOn] = useState(props.publicActivity);
  const [savingPublic, setSavingPublic] = useState(false);

  async function togglePublic(on: boolean) {
    setPublicOn(on);
    setSavingPublic(true);
    const res = await setPublicActivity({ on });
    setSavingPublic(false);
    if (res.ok) {
      toast.show(on ? t('account.settings.toast.publicOn') : t('account.settings.toast.publicOff'), 'success');
      router.refresh();
    } else {
      setPublicOn(!on);
      toast.show(res.error ?? t('account.settings.toast.failed'), 'error');
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
    toast.show(res.ok ? t('account.settings.toast.servicesSaved') : res.error ?? t('account.settings.toast.failed'), res.ok ? 'success' : 'error');
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
    toast.show(res.ok ? t('account.settings.toast.profileSaved') : res.error ?? t('account.settings.toast.failed'), res.ok ? 'success' : 'error');
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
    toast.show(res.ok ? t('account.settings.toast.preferencesSaved') : res.error ?? t('account.settings.toast.failed'), res.ok ? 'success' : 'error');
    if (res.ok) router.refresh();
  }

  async function loadScottPreset() {
    setAvoid(new Set(SCOTT_RULES.filter((r) => r.weight < 0).map((r) => r.trait)));
    setLove(new Set(SCOTT_RULES.filter((r) => r.weight > 0).map((r) => r.trait)));
    toast.show(t('account.settings.toast.scottPreset'), 'info');
  }

  async function saveDigest() {
    setSavingDigest(true);
    const res = await updateDigestPrefs({ dailyDigest, digestMinScore: minScore });
    setSavingDigest(false);
    toast.show(res.ok ? t('account.settings.toast.digestSaved') : res.error ?? t('account.settings.toast.failed'), res.ok ? 'success' : 'error');
    if (res.ok) router.refresh();
  }

  async function revoke(token: string) {
    const res = await deactivateShare(token);
    if (res.ok) {
      setShares((prev) => prev.map((s) => (s.token === token ? { ...s, isActive: false } : s)));
      toast.show(t('account.settings.toast.shareDeactivated'), 'info');
    } else {
      toast.show(res.error ?? t('account.settings.toast.failed'), 'error');
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
      toast.show(res.error ?? t('account.settings.toast.deleteFailed'), 'error');
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">{t('account.settings.heading')}</h1>

      {props.isAdmin && (
        <a
          href="/app/admin/sponsors"
          className="flex items-center justify-between rounded-xl border border-gold-400/40 bg-gold-500/10 p-4 transition hover:bg-gold-500/20"
        >
          <span>
            <span className="block font-semibold text-gold-400">{t('account.settings.admin.sponsoredJudges')}</span>
            <span className="block text-sm text-slate-400">{t('account.settings.admin.sponsorsDesc')}</span>
          </span>
          <span className="text-gold-400">→</span>
        </a>
      )}

      {/* Profile */}
      <section className="card p-5">
        <h2 className="text-lg font-semibold text-white">{t('account.settings.profile.heading')}</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="label" htmlFor="dn">{t('account.settings.profile.displayName')}</label>
            <input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="pl">{t('account.settings.profile.personalLabel')}</label>
              <input id="pl" value={personalLabel} onChange={(e) => setPersonalLabel(e.target.value)} className="input" placeholder={t('account.settings.profile.personalLabelPlaceholder')} />
            </div>
            <div>
              <label className="label" htmlFor="rg">{t('account.settings.profile.viewingCountry')}</label>
              <select id="rg" value={region} onChange={(e) => setRegion(e.target.value)} className="input">
                {REGIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="text-xs text-slate-500">
            {t('account.settings.profile.signedInAs', { email: props.email })}
            {props.username ? ` · @${props.username}` : ''}
          </div>
          <button onClick={saveProfile} disabled={savingProfile} className="btn-primary">
            {savingProfile ? t('account.settings.saving') : t('account.settings.profile.save')}
          </button>
        </div>
      </section>

      {/* Preferences */}
      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{t('account.settings.prefs.heading')}</h2>
          <button onClick={loadScottPreset} className="text-xs text-brand-300 hover:underline">{t('account.settings.prefs.loadScottPreset')}</button>
        </div>
        <div className="mt-4 space-y-4">
          <div>
            <div className="label">{t('account.settings.prefs.avoidLabel')}</div>
            <div className="flex flex-wrap gap-2">
              {AVOIDABLE.map((t) => (
                <button key={t} onClick={() => toggle(avoid, t, setAvoid)} className={`chip border ${avoid.has(t) ? 'chip-active' : ''}`}>
                  {humanTrait(t)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label">{t('account.settings.prefs.loveLabel')}</div>
            <div className="flex flex-wrap gap-2">
              {LOVABLE.map((t) => (
                <button key={t} onClick={() => toggle(love, t, setLove)} className={`chip border ${love.has(t) ? 'chip-active' : ''}`}>
                  {humanTrait(t)}
                </button>
              ))}
            </div>
          </div>
          <button onClick={saveRules} disabled={savingRules} className="btn-primary">
            {savingRules ? t('account.settings.saving') : t('account.settings.prefs.save')}
          </button>
        </div>
      </section>

      {/* My streaming services */}
      <section className="card p-5">
        <h2 className="text-lg font-semibold text-white">{t('account.settings.services.heading')}</h2>
        <p className="mt-1 text-sm text-slate-400">
          {t('account.settings.services.descPre')}{' '}
          <span className="font-semibold text-emerald-300">{t('account.settings.services.freeBadge')}</span>{t('account.settings.services.descPost')}
        </p>

        <input
          value={svcQuery}
          onChange={(e) => setSvcQuery(e.target.value)}
          placeholder={t('account.settings.services.searchPlaceholder')}
          className="input mt-4"
          aria-label={t('account.settings.services.searchAria')}
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {shownServices.map((s) => (
            <button
              key={s.id}
              onClick={() => toggleService(s.id)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition ${
                services.has(s.id)
                  ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100'
                  : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {s.emoji && <span aria-hidden>{s.emoji}</span>}
              {s.name}
              {services.has(s.id) && <span className="text-xs font-bold text-emerald-300">✓</span>}
            </button>
          ))}
          {svcQ && shownServices.length === 0 && (
            <p className="text-sm text-slate-400">{t('account.settings.services.noMatch', { query: svcQuery })}</p>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button onClick={saveServices} disabled={savingServices} className="btn-primary">
            {savingServices ? t('account.settings.saving') : t('account.settings.services.save')}
          </button>
          <span className="text-xs text-slate-400">{t('account.settings.services.selected', { count: services.size })}</span>
        </div>
      </section>

      {/* Friends / public activity */}
      <section className="card p-5">
        <h2 className="text-lg font-semibold text-white">{t('account.settings.friends.heading')}</h2>
        <p className="mt-1 text-sm text-slate-400">
          {props.username ? (
            <>
              {t('account.settings.friends.handlePre')}{' '}
              <span className="font-semibold text-slate-200">@{props.username}</span>{' '}
              {t('account.settings.friends.handlePost')}
            </>
          ) : (
            <>{t('account.settings.friends.setUsername')}</>
          )}
        </p>
        <label className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
          <span className="text-sm text-slate-200">
            {t('account.settings.friends.sharePublicly')}
            <span className="block text-xs text-slate-500">
              {t('account.settings.friends.sharePubliclyDesc')}
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

      {/* Accessibility / Simple view */}
      <section className="card p-5">
        <h2 className="text-lg font-semibold text-white">{t('account.settings.display.heading')}</h2>
        <p className="mt-1 text-sm text-slate-400">
          {t('account.settings.display.desc')}
        </p>
        <div className="mt-4">
          <SimpleModeToggle variant="full" />
        </div>
      </section>

      {/* Notifications */}
      <section className="card p-5">
        <h2 className="text-lg font-semibold text-white">{t('account.settings.notifications.heading')}</h2>
        <p className="mt-1 text-sm text-slate-400">
          {t('account.settings.notifications.desc')}
        </p>
        <div className="mt-4">
          <EnableNotifications />
        </div>
      </section>

      {/* Daily digest */}
      <section className="card p-5">
        <h2 className="text-lg font-semibold text-white">{t('account.settings.digest.heading')}</h2>
        <p className="mt-1 text-sm text-slate-400">
          {t('account.settings.digest.desc')}
        </p>
        <div className="mt-4 space-y-4">
          <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
            <span className="text-sm text-slate-200">
              {t('account.settings.digest.scanDaily')}
              <span className="block text-xs text-slate-500">{t('account.settings.digest.scanDailyDesc')}</span>
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
              {t('account.settings.digest.minScoreLabel')} <span className="font-bold text-brand-200">{minScore}%</span>
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
              <span>{t('account.settings.digest.moreTitles')}</span>
              <span>{t('account.settings.digest.onlyBest')}</span>
            </div>
          </div>
          <button onClick={saveDigest} disabled={savingDigest} className="btn-primary">
            {savingDigest ? t('account.settings.saving') : t('account.settings.digest.save')}
          </button>
        </div>
      </section>

      {/* Shares */}
      <section className="card p-5">
        <h2 className="text-lg font-semibold text-white">{t('account.settings.shares.heading')}</h2>
        {shares.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">{t('account.settings.shares.empty')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-white/5">
            {shares.map((s) => (
              <li key={s.token} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="line-clamp-1 text-sm font-medium text-white">{s.title}</div>
                  <div className="text-xs text-slate-500">
                    {s.isActive ? t('account.settings.shares.active') : t('account.settings.shares.deactivated')}
                    {s.expiresAt ? ` ${t('account.settings.shares.expires', { date: new Date(s.expiresAt).toLocaleDateString() })}` : ''}
                  </div>
                </div>
                {s.isActive && (
                  <button onClick={() => revoke(s.token)} className="btn-ghost text-red-300 hover:bg-red-500/10">
                    {t('account.settings.shares.deactivate')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Danger zone */}
      <section className="card border-red-500/20 p-5">
        <h2 className="text-lg font-semibold text-red-200">{t('account.settings.danger.heading')}</h2>
        <p className="mt-1 text-sm text-slate-400">
          {t('account.settings.danger.desc')}
        </p>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="btn-secondary mt-4 border-red-500/40 text-red-200">
            {t('account.settings.danger.deleteMy')}
          </button>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={doDelete} disabled={deleting} className="btn bg-red-500 text-white hover:bg-red-400">
              {deleting ? t('account.settings.danger.deleting') : t('account.settings.danger.confirmDelete')}
            </button>
            <button onClick={() => setConfirmDelete(false)} className="btn-ghost">
              {t('account.settings.danger.cancel')}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
