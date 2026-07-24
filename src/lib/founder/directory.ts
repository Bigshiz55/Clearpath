import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';
import { getWatchStats } from '@/lib/watchStats';
import { getUserDimensionProfile } from '@/lib/titleDimensions';
import { describePersonality } from '@/lib/scoring/personality';
import { dnaStrength, tasteDials } from '@/lib/scoring/dimensions';
import { loadDnaConfidence } from '@/lib/preference/dnaSignals';
import { loadEvalRows } from '@/lib/reco/store';
import { accuracyReport } from '@/lib/reco/accuracy';
import { FOUNDERS, type FounderKey } from './access';
import { listSessions } from './sessions';
import { activeSession } from './sessionModel';

/**
 * Owner-only cross-founder read (support/comparison). Resolves each configured
 * founder EMAIL → auth user id via the service-role client, then computes their
 * isolated Watch-DNA snapshot and session activity. This deliberately bypasses
 * RLS, so it MUST only ever be called after the caller is confirmed to be an
 * admin/owner. Fail-open per founder — a missing account or table never throws.
 */

export interface FounderSnapshot {
  key: FounderKey;
  name: string;
  email: string | null;
  configured: boolean; // an email is set for this founder
  provisioned: boolean; // that email maps to a real auth account
  rated: number;
  strength: number;
  /** Watch DNA Confidence (0..100), account-level. */
  confidence: number;
  personaTitle: string | null;
  topLeans: string[];
  sessionCount: number;
  activeSessions: number;
  lastActiveAt: number | null;
  /** Recommendation accuracy over logged outcomes (null until enough data). */
  recAccuracy: number | null;
  recSamples: number;
}

/** email(lowercased) → auth user id, by paging the admin user list. */
async function emailToId(admin: ReturnType<typeof createAdminClient>): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error || !data) break;
      for (const u of data.users) {
        if (u.email) map.set(u.email.toLowerCase(), u.id);
      }
      if (data.users.length < 200) break;
    }
  } catch {
    // fail-open: an empty map means every founder reports "not provisioned"
  }
  return map;
}

export async function resolveFounderSnapshots(): Promise<FounderSnapshot[]> {
  const emails = serverEnv.founderEmails();
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    // No service-role key: report config-only snapshots.
    return FOUNDERS.map((f) => baseSnapshot(f.key, f.name, emails[f.key] ?? null, false));
  }

  const idByEmail = await emailToId(admin);

  return Promise.all(
    FOUNDERS.map(async (f) => {
      const email = emails[f.key] ?? null;
      const base = baseSnapshot(f.key, f.name, email, false);
      if (!email) return base;
      const userId = idByEmail.get(email);
      if (!userId) return { ...base, provisioned: false };

      try {
        const stats = await getWatchStats(admin, userId).catch(() => null);
        const rated = stats?.rated ?? 0;
        const [profile, sessions, conf, evalRows] = await Promise.all([
          getUserDimensionProfile(admin, userId, rated).catch(() => null),
          listSessions(admin, userId, f.key).catch(() => []),
          loadDnaConfidence(admin, userId).then((r) => r.confidence.percent).catch(() => 0),
          loadEvalRows(admin, { userId, limit: 2000 }).catch(() => []),
        ]);
        const persona = profile ? describePersonality(profile) : null;
        const dials = profile ? tasteDials(profile, 4) : [];
        const active = activeSession(sessions);
        const report = accuracyReport(evalRows, { minSamples: 10 });
        return {
          ...base,
          provisioned: true,
          rated,
          strength: profile ? dnaStrength(profile) : 0,
          confidence: conf,
          personaTitle: (profile?.samples ?? 0) >= 3 && persona ? persona.title : null,
          topLeans: dials.map((d) => d.lean),
          sessionCount: sessions.length,
          activeSessions: sessions.filter((s) => s.status === 'active').length,
          lastActiveAt: active?.lastActiveAt ?? (sessions[0]?.lastActiveAt ?? null),
          recAccuracy: report.overall.reliable ? Math.round(report.overall.accuracy * 100) : null,
          recSamples: report.overall.n,
        };
      } catch {
        return { ...base, provisioned: true };
      }
    }),
  );
}

function baseSnapshot(key: FounderKey, name: string, email: string | null, provisioned: boolean): FounderSnapshot {
  return {
    key,
    name,
    email,
    configured: !!email,
    provisioned,
    rated: 0,
    strength: 0,
    confidence: 0,
    personaTitle: null,
    topLeans: [],
    sessionCount: 0,
    activeSessions: 0,
    lastActiveAt: null,
    recAccuracy: null,
    recSamples: 0,
  };
}
